// Source search progress: sends the search in the background and shows which
// sources are done and which are still working. Without JavaScript the form
// posts normally and the results show when the search finishes.
(() => {
  const form = document.querySelector("form[data-source-search]");
  const panel = document.getElementById("source-progress");
  if (!form || !panel || !window.fetch || !window.TextDecoder) return;

  const button = form.querySelector("button[type=submit]");
  const buttonText = button.textContent;
  const status = panel.querySelector(".progress-status");
  const list = panel.querySelector(".progress-list");

  function makeRow(label) {
    const li = document.createElement("li");
    li.className = "progress-item";
    li.dataset.state = "working";
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "progress-label";
    name.textContent = label;
    const state = document.createElement("span");
    state.className = "progress-state";
    state.textContent = "searching…";
    li.append(dot, name, state);
    return li;
  }

  function describe(event) {
    if (event.status === "done") {
      const found = event.found === 1 ? "1 found" : `${event.found} found`;
      return `done in ${event.seconds}s · ${found}`;
    }
    if (event.status === "timed out") return "took too long; skipped";
    return `didn't work (${event.seconds}s)`;
  }

  // Shows the results: reloads the claim page, which shows them once.
  function showResults(url) {
    const target = new URL(url, window.location.href);
    if (target.pathname === window.location.pathname) {
      window.location.hash = target.hash;
      window.location.reload();
    } else {
      window.location.assign(target.href);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return; // one search at a time, so credits aren't spent twice

    button.disabled = true;
    button.textContent = "Searching…";
    panel.hidden = false;
    list.replaceChildren();
    status.textContent = "Starting the search…";

    const rows = new Map();
    const started = Date.now();
    let timeLimit = 60;
    let tick = null;
    let finished = false;

    const working = () => [...rows.values()].filter((r) => r.dataset.state === "working").length;
    const updateStatus = () => {
      const left = working();
      if (!left) return;
      const seconds = Math.round((Date.now() - started) / 1000);
      status.textContent = `Searching… ${seconds}s so far (stops at ${timeLimit}s). ${left} source${left === 1 ? "" : "s"} still working.`;
    };
    const stop = (message) => {
      finished = true;
      clearInterval(tick);
      if (message) status.textContent = message;
      button.disabled = false;
      button.textContent = buttonText;
    };

    const handle = (msg) => {
      if (msg.type === "start") {
        timeLimit = msg.timeLimitSeconds || timeLimit;
        for (const source of msg.sources) {
          const row = makeRow(source.label);
          rows.set(source.name, row);
          list.append(row);
        }
        updateStatus();
        tick = setInterval(updateStatus, 1000);
      } else if (msg.type === "source") {
        const row = rows.get(msg.name);
        if (!row) return;
        row.dataset.state = msg.status;
        row.querySelector(".progress-state").textContent = describe(msg);
        updateStatus();
      } else if (msg.type === "saving") {
        status.textContent = "Saving the earliest results…";
      } else if (msg.type === "done") {
        stop("Done. Loading the results…");
        button.disabled = true;
        showResults(msg.redirect);
      } else if (msg.type === "error") {
        stop(msg.message);
      }
    };

    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/x-ndjson" },
        body: new URLSearchParams(new FormData(form)),
        credentials: "same-origin",
      });
      const type = res.headers.get("Content-Type") || "";
      if (!res.ok || !type.includes("ndjson")) {
        window.location.reload(); // e.g. signed out; the page explains
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (line) handle(JSON.parse(line));
        }
      }
      if (!finished) stop("The search stopped before finishing. Reload the page to see what was saved.");
    } catch {
      if (!finished) stop("Lost touch with the search. Reload the page to see what was saved.");
    }
  });
})();

const copyWraps = document.querySelectorAll("[data-copy-wrap]");

copyWraps.forEach((wrap) => {
  const button = wrap.querySelector("[data-copy]");
  const status = wrap.querySelector(".copy-status");

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      status.textContent = "copied";
    } catch {
      status.textContent = "select the command to copy it";
    }
  });
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const terminal = document.querySelector("[data-terminal]");
const terminalAnimation = terminal?.querySelector(".terminal-animation");
const bundleState = document.querySelector("[data-bundle-state]");
const commands = [...document.querySelectorAll("[data-command]")];
const outputs = [...document.querySelectorAll("[data-output]")];

if (!reducedMotion && terminal && terminalAnimation && bundleState) {
  root.classList.add("demo-live");
  bundleState.textContent = "private";

  const delay = (duration) =>
    new Promise((resolve) => {
      let remaining = duration;
      let started = performance.now();
      let timer;

      const finish = () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        resolve();
      };

      const onVisibilityChange = () => {
        if (document.hidden) {
          remaining -= performance.now() - started;
          window.clearTimeout(timer);
          return;
        }
        started = performance.now();
        timer = window.setTimeout(finish, Math.max(remaining, 0));
      };

      document.addEventListener("visibilitychange", onVisibilityChange);
      if (!document.hidden) timer = window.setTimeout(finish, remaining);
    });

  const typeCommand = async (element) => {
    const text = element.dataset.text;
    element.textContent = text[0];
    terminalAnimation.classList.remove("is-resetting");
    await delay(55);
    for (const character of text.slice(1)) {
      element.textContent += character;
      await delay(55);
    }
  };

  const reset = async () => {
    terminalAnimation.classList.add("is-resetting");
    root.classList.remove("bundle-pushed", "bundle-linked");
    bundleState.textContent = "private";
    commands.forEach((command) => {
      command.textContent = "";
    });
    outputs.forEach((output) => {
      output.style.visibility = "hidden";
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  };

  const showPhase = (phase) => {
    outputs
      .filter((output) => output.dataset.phase === phase)
      .forEach((output) => {
        output.style.visibility = "visible";
      });
  };

  const runDemo = async () => {
    while (true) {
      await reset();
      await typeCommand(commands[0]);
      showPhase("push");
      root.classList.add("bundle-pushed");
      bundleState.textContent = "private";
      await delay(620);
      await typeCommand(commands[1]);
      showPhase("link");
      root.classList.add("bundle-linked");
      bundleState.textContent = "link";
      await delay(3200);
    }
  };

  runDemo();
}

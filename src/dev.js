const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const nodeBin = process.execPath;
const quietEnv = { ...process.env, QUIET: "1", WATCH_QUIET: "1" };

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function resolveBin(name) {
  const binName = process.platform === "win32" ? `${name}.cmd` : name;
  const localBin = path.join(root, "node_modules", ".bin", binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return name;
}

function resolveHttpServerEntry() {
  return path.join(root, "node_modules", "http-server", "bin", "http-server");
}

async function main() {
  try {
    console.log("Dev: cleaning docs...");
    await run(nodeBin, ["src/clean.js", "docs"], { cwd: root, env: quietEnv });

    console.log("Dev: initial build...");
    await run(nodeBin, ["src/convert_md_to_html_pandoc.js"], {
      cwd: root,
      env: quietEnv,
    });
    await run(nodeBin, ["src/generate_index_with_dates.js"], {
      cwd: root,
      env: quietEnv,
    });
    await run(nodeBin, ["src/generate_sitemap.js"], {
      cwd: root,
      env: quietEnv,
    });
    await run(nodeBin, ["src/generate_overview.js"], {
      cwd: root,
      env: quietEnv,
    });
  } catch (error) {
    console.error(`Dev: initial build failed: ${error.message}`);
    process.exit(1);
  }

  console.log("Dev: starting watcher and server...");

  const watcher = spawn(nodeBin, ["watcher/watcher.js"], {
    cwd: root,
    env: quietEnv,
    stdio: "inherit",
  });

  const server = spawn(nodeBin, [resolveHttpServerEntry(), "-p", "3003"], {
    cwd: root,
    env: quietEnv,
    stdio: "inherit",
  });

  const shutdown = (signal) => {
    if (signal) {
      console.log(`Dev: received ${signal}, shutting down...`);
    }
    if (watcher && !watcher.killed) watcher.kill("SIGINT");
    if (server && !server.killed) server.kill("SIGINT");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  watcher.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Dev: watcher exited with code ${code}`);
    }
    shutdown();
  });

  watcher.on("error", (error) => {
    console.error(`Dev: watcher failed to start: ${error.message}`);
    shutdown();
  });

  server.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Dev: server exited with code ${code}`);
    }
    shutdown();
  });

  server.on("error", (error) => {
    console.error(`Dev: server failed to start: ${error.message}`);
    shutdown();
  });
}

main();

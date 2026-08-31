#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const current = process.argv[index];
  if (!current.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(current.slice(2), next);
    index += 1;
  } else {
    args.set(current.slice(2), "true");
  }
}

function printHelp() {
  console.log(`
Usage:
  node scripts/monitor-process.mjs --port 3010
  node scripts/monitor-process.mjs --pid 12345
  node scripts/monitor-process.mjs --match ".next/standalone/server.js"

Options:
  --port <number>       Find process listening on this local TCP port.
  --pid <number>        Monitor this PID and its child processes.
  --match <text>        Monitor processes whose command contains this text.
  --interval <seconds>  Poll interval. Default: 3.
  --csv <path>          Append samples to a CSV file.
  --once                Print one sample and exit.
`);
}

if (args.has("help") || args.has("h")) {
  printHelp();
  process.exit(0);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
  });
  if (result.error) return "";
  return result.stdout.trim();
}

function findPidByPort(port) {
  const output = run("lsof", ["-nP", "-iTCP:" + port, "-sTCP:LISTEN", "-t"]);
  return output
    .split(/\s+/)
    .map((item) => Number(item))
    .find((item) => Number.isInteger(item) && item > 0);
}

function listProcesses() {
  const output = run("ps", ["-axo", "pid=,ppid=,pcpu=,rss=,command="]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpu: Number(match[3]),
        rssKb: Number(match[4]),
        command: match[5],
      };
    })
    .filter(Boolean);
}

function collectTree(processes, rootPid) {
  const byParent = new Map();
  for (const item of processes) {
    const children = byParent.get(item.ppid) ?? [];
    children.push(item);
    byParent.set(item.ppid, children);
  }

  const result = [];
  const queue = [rootPid];
  const seen = new Set();
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const current = processes.find((item) => item.pid === pid);
    if (current) result.push(current);
    for (const child of byParent.get(pid) ?? []) {
      queue.push(child.pid);
    }
  }
  return result;
}

function resolveTargets() {
  const processes = listProcesses();
  const pidArg = Number(args.get("pid"));
  const portArg = args.get("port");
  const matchArg = args.get("match");

  if (Number.isInteger(pidArg) && pidArg > 0) {
    return collectTree(processes, pidArg);
  }

  if (portArg) {
    const pid = findPidByPort(portArg);
    return pid ? collectTree(processes, pid) : [];
  }

  if (matchArg) {
    return processes.filter((item) => item.command.includes(matchArg));
  }

  return [];
}

function formatMb(kb) {
  return (kb / 1024).toFixed(1);
}

function sample() {
  const targets = resolveTargets();
  const totalCpu = targets.reduce((total, item) => total + item.cpu, 0);
  const totalRssKb = targets.reduce((total, item) => total + item.rssKb, 0);
  const now = new Date();
  const row = {
    time: now.toISOString(),
    pids: targets.map((item) => item.pid).join("+"),
    count: targets.length,
    cpu: totalCpu,
    rssMb: totalRssKb / 1024,
    command: targets[0]?.command ?? "",
  };

  console.log(
    `${row.time} | pids=${row.pids || "-"} | proc=${row.count} | cpu=${row.cpu.toFixed(
      1,
    )}% | rss=${formatMb(totalRssKb)} MB`,
  );

  const csvPath = args.get("csv");
  if (csvPath) {
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    const exists = fs.existsSync(csvPath);
    const line = [
      row.time,
      row.pids,
      row.count,
      row.cpu.toFixed(2),
      row.rssMb.toFixed(2),
      JSON.stringify(row.command),
    ].join(",");
    fs.appendFileSync(
      csvPath,
      `${exists ? "" : "time,pids,process_count,cpu_percent,rss_mb,command\n"}${line}\n`,
    );
  }
}

if (!args.has("pid") && !args.has("port") && !args.has("match")) {
  printHelp();
  process.exit(1);
}

sample();

if (args.has("once")) {
  process.exit(0);
}

const intervalSeconds = Math.max(1, Number(args.get("interval")) || 3);
setInterval(sample, intervalSeconds * 1000);

#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_PATTERNS = [
  { name: 'Pollinations secret key', regex: /\bplln_sk_[A-Za-z0-9]{16,}\b/g },
  { name: 'Pollinations publishable key', regex: /\bplln_pk_[A-Za-z0-9]{16,}\b/g },
  { name: 'Replicate token', regex: /\br8_[A-Za-z0-9]{20,}\b/g },
  { name: 'OpenAI-style key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  {
    name: 'Hardcoded credential assignment',
    regex: /\b[A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)[A-Za-z0-9_]*\b\s*[:=]\s*['"`](?=[^'"`\s]{16,})(?=[^'"`]*[A-Za-z])(?=[^'"`]*\d)[^'"`\s]+['"`]/gi,
  },
];

const ALLOWLIST_HINTS = [
  'your_',
  '_here',
  'example',
  'xxxx',
  'xxxxx',
  'changeme',
  '<redacted>',
];

const IGNORE_PATH_PREFIXES = [
  'node_modules/',
  'dist/',
  '.git/',
];

function isAllowlisted(text) {
  const lowered = text.toLowerCase();
  return ALLOWLIST_HINTS.some(hint => lowered.includes(hint));
}

function isIgnoredPath(file) {
  return IGNORE_PATH_PREFIXES.some(prefix => file.startsWith(prefix));
}

function getTrackedFiles() {
  const output = execSync('git ls-files -z', { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function scanFile(file) {
  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const findings = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of SECRET_PATTERNS) {
      const matches = line.match(pattern.regex);
      if (!matches) continue;

      for (const match of matches) {
        if (isAllowlisted(match) || isAllowlisted(line)) {
          continue;
        }
        findings.push({
          file,
          line: i + 1,
          type: pattern.name,
          sample: match.slice(0, 10) + '***',
        });
      }
    }
  }

  return findings;
}

const files = getTrackedFiles().filter(file => !isIgnoredPath(file));
const findings = files.flatMap(scanFile);

if (findings.length > 0) {
  console.error('Detected possible hardcoded secrets:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.type}] ${finding.sample}`);
  }
  console.error('\nPlease move secrets to environment variables before committing.');
  process.exit(1);
}

console.log('No hardcoded secrets detected in tracked files.');

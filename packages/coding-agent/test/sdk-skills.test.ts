import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExtensionRuntime } from "../src/core/extensions/loader.js";
import type { ResourceLoader } from "../src/core/resource-loader.js";
import { createAgentSession } from "../src/core/sdk.js";
import { SessionManager } from "../src/core/session-manager.js";

describe("createAgentSession skills option", () => {
	let tempDir: string;
	let skillsDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-sdk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		skillsDir = join(tempDir, "skills", "test-skill");
		mkdirSync(skillsDir, { recursive: true });

		// Create a test skill in the pi skills directory
		writeFileSync(
			join(skillsDir, "SKILL.md"),
			`---
name: test-skill
description: A test skill for SDK tests.
---

# Test Skill

This is a test skill.
`,
		);
	});

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("should discover skills by default and expose them on session.skills", async () => {
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.inMemory(),
		});

		// Skills should be discovered and exposed on the session
		expect(session.resourceLoader.getSkills().skills.length).toBeGreaterThan(0);
		expect(session.resourceLoader.getSkills().skills.some((s) => s.name === "test-skill")).toBe(true);
	});

	it("should have empty skills when resource loader returns none (--no-skills)", async () => {
		const resourceLoader: ResourceLoader = {
			getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
			getSkills: () => ({ skills: [], diagnostics: [] }),
			getPrompts: () => ({ prompts: [], diagnostics: [] }),
			getThemes: () => ({ themes: [], diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [] }),
			getSystemPrompt: () => undefined,
			getAppendSystemPrompt: () => [],
			getPathMetadata: () => new Map(),
			extendResources: () => {},
			reload: async () => {},
		};

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		expect(session.resourceLoader.getSkills().skills).toEqual([]);
		expect(session.resourceLoader.getSkills().diagnostics).toEqual([]);
	});

	it("should use provided skills when resource loader supplies them", async () => {
		const customSkill = {
			name: "custom-skill",
			description: "A custom skill",
			filePath: "/fake/path/SKILL.md",
			baseDir: "/fake/path",
			source: "custom" as const,
			disableModelInvocation: false,
		};

		const resourceLoader: ResourceLoader = {
			getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
			getSkills: () => ({ skills: [customSkill], diagnostics: [] }),
			getPrompts: () => ({ prompts: [], diagnostics: [] }),
			getThemes: () => ({ themes: [], diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [] }),
			getSystemPrompt: () => undefined,
			getAppendSystemPrompt: () => [],
			getPathMetadata: () => new Map(),
			extendResources: () => {},
			reload: async () => {},
		};

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.inMemory(),
			resourceLoader,
		});

		expect(session.resourceLoader.getSkills().skills).toEqual([customSkill]);
		expect(session.resourceLoader.getSkills().diagnostics).toEqual([]);
	});

	it("stores initial system prompt snapshot in header for a new session", async () => {
		const sessionDir = join(tempDir, "sessions");
		const sessionManager = SessionManager.create(tempDir, sessionDir);

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager,
		});

		expect(session.sessionManager.getHeader()?.systemPrompt).toBeTruthy();
		expect(session.sessionManager.getHeader()?.availableTools).toBeTruthy();
		expect(session.sessionManager.getHeader()?.availableTools?.length).toBeGreaterThan(0);
	});

	it("does not backfill systemPrompt when resuming an existing session without the field", async () => {
		const sessionDir = join(tempDir, "sessions");
		const original = SessionManager.create(tempDir, sessionDir);
		original.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
		original.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "world" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		const sessionFile = original.getSessionFile();
		expect(sessionFile).toBeTruthy();
		const originalHeader = JSON.parse(readFileSync(sessionFile!, "utf8").split("\n")[0]);
		expect(originalHeader.systemPrompt).toBeUndefined();
		expect(originalHeader.availableTools).toBeUndefined();

		const resumed = SessionManager.open(sessionFile!, sessionDir);
		await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: resumed,
		});

		expect(resumed.getHeader()?.systemPrompt).toBeUndefined();
		expect(resumed.getHeader()?.availableTools).toBeUndefined();
		const resumedHeader = JSON.parse(readFileSync(sessionFile!, "utf8").split("\n")[0]);
		expect(resumedHeader.systemPrompt).toBeUndefined();
		expect(resumedHeader.availableTools).toBeUndefined();
	});
});

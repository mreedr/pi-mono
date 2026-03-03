import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportFromFile } from "../src/core/export-html/index.js";

function extractSessionData(html: string): {
	systemPrompt?: string;
	tools?: Array<{ name: string; description: string; parameters: unknown }>;
} {
	const match = html.match(/<script id="session-data" type="application\/json">([^<]+)<\/script>/);
	if (!match) {
		throw new Error("Session data payload not found in exported HTML");
	}
	return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

describe("exportFromFile", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `export-html-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("includes header systemPrompt in exported session data", async () => {
		const inputPath = join(tempDir, "session.jsonl");
		const outputPath = join(tempDir, "session.html");
		const header = {
			type: "session",
			version: 3,
			id: "session-1",
			timestamp: "2026-03-02T12:00:00.000Z",
			cwd: tempDir,
			systemPrompt: "Persisted system prompt snapshot",
			availableTools: [
				{
					name: "read",
					description: "Read files",
					parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
				},
			],
		};
		const entry = {
			type: "message",
			id: "entry-1",
			parentId: null,
			timestamp: "2026-03-02T12:00:01.000Z",
			message: {
				role: "user",
				content: "hello",
				timestamp: Date.now(),
			},
		};
		writeFileSync(inputPath, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`, "utf8");

		await exportFromFile(inputPath, outputPath);

		const html = readFileSync(outputPath, "utf8");
		const sessionData = extractSessionData(html);
		expect(sessionData.systemPrompt).toBe("Persisted system prompt snapshot");
		expect(sessionData.tools).toEqual([
			{
				name: "read",
				description: "Read files",
				parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
			},
		]);
	});
});

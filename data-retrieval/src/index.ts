import assert = require("assert");
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export interface Entry {
	config: Config;
	mapping: {
		unmodified: Record<LineEnding, LineEnding>;
		show: Record<LineEnding, LineEnding>;
		clone: Record<LineEnding, LineEnding>;
		commitNew: Record<LineEnding, LineEnding>;
		commitPrependSimpleText: Record<LineEnding, LineEnding>;
		commitModifySimpleFile: Record<LineEnding, LineEnding>;
		commitModifyCrLfFile: Record<LineEnding, LineEnding>;
		commitModifyLfFile: Record<LineEnding, LineEnding>;
		commitModifyMixedFile: Record<LineEnding, LineEnding>;
	};
}

function main() {
	rmdirSync(`./git-workspace/`, { recursive: true });
	const ctx = new Context(`./git-workspace/`);

	const configs = facorize({
		text: ["auto", "false", "true", "undefined", "binary"],
		eol: ["crlf", "lf", "undefined"],

		core_autocrlf: ["false", "true"],
		core_eol: ["crlf", "lf", "native"],
	} as const);

	const results = new Array<Entry>();

	/*
	configs.length = 0;
	configs.push({
		core_autocrlf: "false",
		core_eol: "crlf",
		eol: "crlf",
		text: "true",
	});
	*/

	for (const config of configs) {
		results.push({ config, mapping: getMappingForConfig(config) });
	}

	console.log(JSON.stringify(results[0].mapping, undefined, 4));

	ctx.writeTextFile("data.json", JSON.stringify(results, undefined, 4));
}

function facorize<T extends { [key: string]: readonly any[] }>(obj: T): { [TKey in keyof T]: T[TKey][number] }[] {
	let results = [{} as any];

	for (const [key, values] of Object.entries(obj)) {
		let newResults = [];

		for (const val of values) {
			for (const r of results) {
				newResults.push({ ...r, [key]: val });
			}
		}

		results = newResults;
	}

	return results;
}

class Context {
	public readonly path: string;
	constructor(path: string) {
		this.path = resolve(path);
	}

	public git(...args: string[]): string {
		console.log(`> {${this.path}} git ${args.join(" ")}`);
		const result = spawnSync("git", args, {
			encoding: "utf-8",
			cwd: this.path,
			shell: false,
		});
		console.log(`< ${result.stdout}`);
		if (result.status) {
			throw new Error(result.stderr);
		}
		if (result.error) {
			throw result.error;
		}

		return result.stdout;
	}

	public resolve(file: string): string {
		return resolve(this.path, file);
	}

	public subContext(name: string): Context {
		return new Context(this.resolve(name));
	}

	public readTextFile(file: string): string {
		return readFileSync(this.resolve(file), { encoding: "utf-8" });
	}

	public writeTextFile(file: string, content: string): void {
		writeFileSync(this.resolve(file), content, { encoding: "utf-8" });
	}

	public prependTextFile(file: string, text: string): void {
		const content = text + this.readTextFile(file);
		writeFileSync(this.resolve(file), content, { encoding: "utf-8" });
	}
}

interface Config {
	text: "auto" | "false" | "true" | "undefined" | "binary";
	eol: "crlf" | "lf" | "undefined";

	core_autocrlf: "false" | "true";
	core_eol: "crlf" | "lf" | "native";
}

let map = new Map<string, number>();
function hash(value: unknown): string {
	const key = JSON.stringify(value);
	let existing = map.get(key);
	if (existing === undefined) {
		existing = map.size + 1;
		map.set(key, existing);
	}
	return "hash" + existing;
}

let id = 0;

type LineEnding = "lf" | "crlf" | "mixed";

function getGitAttributesConfig(config: Config) {
	const options = new Array<string>();
	if (config.text !== "undefined") {
		if (config.text === "true") {
			options.push(`text`);
		} else if (config.text === "false") {
			options.push(`-text`);
		} else if (config.text === "auto") {
			options.push(`text=auto`);
		} else if (config.text === "binary") {
			options.push(`binary`);
		}
	}
	if (config.eol !== "undefined") {
		options.push(`eol=${config.eol}`);
	}

	if (options.length > 0) {
		return `*.txt ${options.join(" ")}`;
	} else {
		return "";
	}
}

function getGitArgs(config: Config): string[][] {
	const result = new Array<string[]>();
	result.push(["config", "core.autocrlf", config.core_autocrlf]);
	result.push(["config", "core.eol", config.core_eol]);
	return result;
}

function getMappingForConfig(config: Config): Entry["mapping"] {
	const key = hash(getGitAttributesConfig(config));

	const ctx = new Context(`./git-workspace`);
	let ctxTargetRepo: Context;
	{
		const ctxSourceRepo = ctx.subContext(`source${key}`);
		ctxTargetRepo = ctx.subContext(`target${id++}`);

		if (!existsSync(ctxSourceRepo.path)) {
			prepareGitRepo(ctxSourceRepo);

			// Add \n to cause a change
			ctxSourceRepo.writeTextFile(`.gitattributes`, getGitAttributesConfig(config) + "\n");

			ctxSourceRepo.git("add", ".gitattributes");
			ctxSourceRepo.git("commit", "-m", "test - update1");
		}

		ctx.git("clone", ctxSourceRepo.path, ctxTargetRepo.path, "--no-checkout");
	}

	ctxTargetRepo.git("config", "commit.gpgsign", "false");

	for (const args of getGitArgs(config)) {
		ctxTargetRepo.git(...args);
	}

	ctxTargetRepo.git("checkout", "main");

	const show = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-lf.txt`))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-crlf.txt`))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-mixed.txt`))),
	};

	const clone: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("1-lf.txt"))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("1-crlf.txt"))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("1-mixed.txt"))),
	};

	for (let i = 1; i <= 3; i++) {
		const file = ["lf", "crlf", "mixed"][i - 1];
		// These lines add another line ending
		ctxTargetRepo.writeTextFile(`1-${file}.txt`, "Xline1Lf\nXline1Lf\n");
		ctxTargetRepo.writeTextFile(`2-${file}.txt`, "XlineCrLf1\r\nXlineCrLf1\r\n");
		ctxTargetRepo.writeTextFile(`3-${file}.txt`, "Xline1Lf\nline2CrLf\r\nXline1Lf\nline2CrLf\r\n");
	}

	// This does not add another line ending
	ctxTargetRepo.prependTextFile(`4-lf.txt`, "PrependedText");
	ctxTargetRepo.prependTextFile(`4-crlf.txt`, "PrependedText");
	ctxTargetRepo.prependTextFile(`4-mixed.txt`, "PrependedText");

	ctxTargetRepo.writeTextFile(`new-lf.txt`, "Xline1Lf\nXline1Lf\n");
	ctxTargetRepo.writeTextFile(`new-crlf.txt`, "XlineCrLf1\r\nXlineCrLf1\r\n");
	ctxTargetRepo.writeTextFile(`new-mixed.txt`, "Xline1Lf\nline2CrLf\r\nXline1Lf\nline2CrLf\r\n");

	ctxTargetRepo.writeTextFile(`1-simple.txt`, "Xline1Lf\nXline1Lf\n");
	ctxTargetRepo.writeTextFile(`2-simple.txt`, "XlineCrLf1\r\nXlineCrLf1\r\n");
	ctxTargetRepo.writeTextFile(`3-simple.txt`, "Xline1Lf\nline2CrLf\r\nXline1Lf\nline2CrLf\r\n");

	ctxTargetRepo.git("add", "*");
	ctxTargetRepo.git("commit", "-m", "update");

	const mappings = new Array<Record<LineEnding, LineEnding>>();
	for (let i = 1; i <= 3; i++) {
		const file = ["lf", "crlf", "mixed"][i - 1];
		mappings.push({
			lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:1-${file}.txt`))),
			crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:2-${file}.txt`))),
			mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:3-${file}.txt`))),
		});
	}
	const [commitModifyLfFile, commitModifyCrLfFile, commitModifyMixedFile] = mappings;

	const commitPrependSimpleText: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:4-lf.txt`))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:4-crlf.txt`))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:4-mixed.txt`))),
	};

	const unmodified: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-lf.txt`))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-crlf.txt`))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:5-mixed.txt`))),
	};

	const commitNew: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:new-lf.txt`))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:new-crlf.txt`))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:new-mixed.txt`))),
	};

	const commitModifySimpleFile: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:1-simple.txt`))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:2-simple.txt`))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("cat-file", "blob", `HEAD:3-simple.txt`))),
	};

	return {
		clone,
		commitNew,
		commitPrependSimpleText,
		commitModifySimpleFile,
		commitModifyCrLfFile,
		commitModifyLfFile,
		commitModifyMixedFile,
		unmodified,
		show,
	};
}

function prepareGitRepo(ctx: Context) {
	mkdirSync(ctx.path, { recursive: true });
	ctx.git("init", "--initial-branch=main");
	ctx.git("config", "commit.gpgsign", "false");

	for (const args of getGitArgs({ core_autocrlf: "false", core_eol: "lf", eol: "undefined", text: "false" })) {
		ctx.git(...args);
	}

	// We use -text to get the files as is into HEAD
	writeFileSync(ctx.resolve(`.gitattributes`), "* binary\n");

	ctx.git("add", "*");
	ctx.git("commit", "-m", "prepareGitRepo - update1");

	for (let i = 1; i <= 5; i++) {
		ctx.writeTextFile(`${i}-lf.txt`, "line1Lf\n");
		ctx.writeTextFile(`${i}-crlf.txt`, "lineCrLf1\r\n");
		ctx.writeTextFile(`${i}-mixed.txt`, "line1Lf\nline2CrLf\r\n");
		ctx.writeTextFile(`${i}-simple.txt`, "empty");
	}

	ctx.git("add", "*");
	ctx.git("commit", "-m", "prepareGitRepo - update2");

	assert.deepStrictEqual(getLineEndings(ctx.git("cat-file", "blob", "HEAD:1-lf.txt")), ["lf"]);
	assert.deepStrictEqual(getLineEndings(ctx.git("cat-file", "blob", "HEAD:1-crlf.txt")), ["crlf"]);
	assert.deepStrictEqual(getLineEndings(ctx.git("cat-file", "blob", "HEAD:1-mixed.txt")), ["lf", "crlf"]);
	assert.deepStrictEqual(getLineEndings(ctx.git("cat-file", "blob", "HEAD:1-simple.txt")), []);

	writeFileSync(ctx.resolve(`.gitattributes`), "");
	ctx.git("add", ".gitattributes");
	ctx.git("commit", "-m", "prepareGitRepo - update3");
}

function getLineEndings(content: string): ("lf" | "crlf")[] {
	const result = new Array<"lf" | "crlf">();
	let idx = 0;
	while (idx < content.length) {
		if (content[idx] === "\n") {
			result.push("lf");
		} else if (content[idx] === "\r" && content[idx + 1] === "\n") {
			result.push("crlf");
			idx++;
		}
		idx++;
	}
	return result;
}

function classifyLineEndings(lineEndings: ("lf" | "crlf")[]): LineEnding {
	if (lineEndings.every((e) => e === "crlf")) {
		return "crlf";
	}
	if (lineEndings.every((e) => e === "lf")) {
		return "lf";
	}
	return "mixed";
}

main();

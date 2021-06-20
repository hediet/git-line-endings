import assert = require("assert");
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

function main() {
	rmdirSync(`./git-workspace/`, { recursive: true });
	const ctx = new Context(`./git-workspace/`);

	const configs = facorize({
		text: ["auto", "false", "true", "undefined"],
		eol: ["crlf", "lf", "undefined"],

		core_autocrlf: ["false", "true"],
		core_eol: ["crlf", "lf", "native"],
	} as const);

	const results = new Array<{
		config: Config;
		mapping: {
			checkout: Record<LineEnding, LineEnding>;
			checkin: Record<LineEnding, LineEnding>;
			checkinNew: Record<LineEnding, LineEnding>;
		};
	}>();

	for (const config of configs) {
        results.push({ config, mapping: test(config) });
	}

    ctx.writeTextFile('results.json', JSON.stringify(results, undefined, 4));
}

function facorize<T extends { [key: string]: readonly any[] }>(
	obj: T
): { [TKey in keyof T]: T[TKey][number] }[] {
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
		return writeFileSync(this.resolve(file), content, { encoding: "utf-8" });
	}
}

interface Config {
	text: "auto" | "false" | "true" | "undefined";
	eol: "crlf" | "lf" | "undefined";

	core_autocrlf: "false" | "true";
	core_eol: "crlf" | "lf" | "native";
}

let map = new Map<string, number>();
function hash(value: unknown): number {
	const key = JSON.stringify(value);
	let existing = map.get(key);
	if (existing === undefined) {
		existing = map.size + 1;
		map.set(key, existing);
	}
	return existing;
}

let id = 0;

type LineEnding = "lf" | "crlf" | "mixed";

function test(config: Config): {
	checkout: Record<LineEnding, LineEnding>;
	checkin: Record<LineEnding, LineEnding>;
	checkinNew: Record<LineEnding, LineEnding>;
} {
	const key = hash({ text: config.text, eol: config.eol });
	const ctx = new Context(`./git-workspace`);
	const ctxSourceRepo = ctx.subContext(`source${key}`);

	if (!existsSync(ctxSourceRepo.path)) {
		prepareGitRepo(ctxSourceRepo);

		const options = new Array<string>();
		if (config.text !== "undefined") {
			options.push(`text=${config.text}`);
		}
		if (config.eol !== "undefined") {
			options.push(`eol=${config.eol}`);
		}

		let str: string;
		if (options.length > 0) {
			str = `*.txt ${options.join(" ")}`;
		} else {
			str = "";
		}
		writeFileSync(ctxSourceRepo.resolve(`.gitattributes`), `${str}\n`);

		ctxSourceRepo.git("add", "*");
		ctxSourceRepo.git("commit", "-m", "update");
	}

	const ctxTargetRepo = ctx.subContext(`target${id++}`);

	ctx.git("clone", ctxSourceRepo.path, ctxTargetRepo.path, "--no-checkout");
	ctxTargetRepo.git("config", "commit.gpgsign", "false");

	ctxTargetRepo.git("config", "core.autocrlf", config.core_autocrlf);
	ctxTargetRepo.git("config", "core.eol", config.core_eol);

	ctxTargetRepo.git("checkout", "main");

	const checkout: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("lf.txt"))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("crlf.txt"))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.readTextFile("lf-crlf.txt"))),
	};

	ctxTargetRepo.writeTextFile(`crlf.txt`, "XlineCrLf1\r\nXlineCrLf1\r\n");
	ctxTargetRepo.writeTextFile(`lf.txt`, "Xline1Lf\nXline1Lf\n");
	ctxTargetRepo.writeTextFile(`lf-crlf.txt`, "Xline1Lf\nline2CrLf\r\nXline1Lf\nline2CrLf\r\n");

	ctxTargetRepo.writeTextFile(`crlf-new.txt`, "XlineCrLf1\r\nXlineCrLf1\r\n");
	ctxTargetRepo.writeTextFile(`lf-new.txt`, "Xline1Lf\nXline1Lf\n");
	ctxTargetRepo.writeTextFile(
		`lf-crlf-new.txt`,
		"Xline1Lf\nline2CrLf\r\nXline1Lf\nline2CrLf\r\n"
	);

	ctxTargetRepo.git("add", "*");
	ctxTargetRepo.git("commit", "-m", "update");

	const checkin: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("show", "head:lf.txt"))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("show", "head:crlf.txt"))),
		mixed: classifyLineEndings(getLineEndings(ctxTargetRepo.git("show", "head:lf-crlf.txt"))),
	};

	const checkinNew: Record<LineEnding, LineEnding> = {
		lf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("show", "head:lf-new.txt"))),
		crlf: classifyLineEndings(getLineEndings(ctxTargetRepo.git("show", "head:crlf-new.txt"))),
		mixed: classifyLineEndings(
			getLineEndings(ctxTargetRepo.git("show", "head:lf-crlf-new.txt"))
		),
	};

	return {
		checkout,
		checkin,
		checkinNew,
	};
}

function prepareGitRepo(ctx: Context) {
	mkdirSync(ctx.path, { recursive: true });
	ctx.git("init", "--initial-branch=main");
	ctx.git("config", "commit.gpgsign", "false");

	writeFileSync(ctx.resolve(`.gitattributes`), "*.txt binary\n");

	ctx.git("add", "*");
	ctx.git("commit", "-m", "update");

	ctx.writeTextFile(`crlf.txt`, "lineCrLf1\r\n");
	ctx.writeTextFile(`lf.txt`, "line1Lf\n");
	ctx.writeTextFile(`lf-crlf.txt`, "line1Lf\nline2CrLf\r\n");

	ctx.git("add", "*");
	ctx.git("commit", "-m", "update");

	assert.deepStrictEqual(getLineEndings(ctx.git("show", "head:lf-crlf.txt")), ["lf", "crlf"]);
	assert.deepStrictEqual(getLineEndings(ctx.git("show", "head:lf.txt")), ["lf"]);
	assert.deepStrictEqual(getLineEndings(ctx.git("show", "head:crlf.txt")), ["crlf"]);

	writeFileSync(ctx.resolve(`.gitattributes`), "");
	ctx.git("add", "*");
	ctx.git("commit", "-m", "update");
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

import { computed, observable } from "mobx";

const urls = {
	windows: "https://hediet.github.io/git-line-endings/data/windows/data.json",
	unix: "https://hediet.github.io/git-line-endings/data/ubuntu/data.json",
};

interface Config {
	os: "unix" | "windows";
	text: "auto" | "false" | "true" | "undefined" | "binary";
	eol: "crlf" | "lf" | "undefined";

	core_autocrlf: "false" | "true";
	core_eol: "crlf" | "lf" | "native";
}

export type LineEnding = "lf" | "crlf" | "mixed";

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

interface BindableValue<T> {
	get(): T;
	set(value: T): void;
}

export interface ActiveBindableValue<T> extends BindableValue<T> {
	readonly enabled: boolean;
}

class Setting<T extends string> implements ActiveBindableValue<T> {
	constructor(
		private readonly name: string,
		private readonly defaultValue: T,
		private isEnabled: () => boolean
	) {
		const searchParams = new URLSearchParams(window.location.search);
		const val = searchParams.get(this.name);

		this.value = val !== null ? (val as T) : defaultValue;
	}

	@observable
	private value: T;

	get enabled(): boolean {
		return this.isEnabled();
	}

	get(): T {
		return this.value;
	}

	set(value: T): void {
		const searchParams = new URLSearchParams(window.location.search);

		searchParams.set(this.name, value);
		this.value = value;

		window.history.pushState(undefined, "", "?" + searchParams.toString());
	}
}

export class Model {
	@observable private entries: Entry[] | undefined = undefined;

	public readonly os = new Setting<Config["os"]>("os", "unix", () =>
		this.isEnabled("os")
	);
	public readonly text = new Setting<Config["text"]>(
		"text",
		"undefined",
		() => this.isEnabled("text")
	);
	public readonly eol = new Setting<Config["eol"]>("eol", "undefined", () =>
		this.isEnabled("eol")
	);
	public readonly core_autocrlf = new Setting<Config["core_autocrlf"]>(
		"core_autocrlf",
		"false",
		() => this.isEnabled("core_autocrlf")
	);
	public readonly core_eol = new Setting<Config["core_eol"]>(
		"core_eol",
		"native",
		() => this.isEnabled("core_eol")
	);

	private get currentConfig(): Config {
		return {
			os: this.os.get(),
			text: this.text.get(),
			eol: this.eol.get(),
			core_autocrlf: this.core_autocrlf.get(),
			core_eol: this.core_eol.get(),
		};
	}

	public get gitAttributesContent(): string {
		return getGitAttributesConfig(this.currentConfig);
	}

	public get gitConfigCommands(): string {
		return getGitArgs(this.currentConfig)
			.map((c) => `git ${c.join(" ")}`)
			.join("\n");
	}

	private isEnabled(key: keyof Config): boolean {
		if (!this.entries) {
			return false;
		}

		const result = this.entries.filter((d) => {
			return (
				(key === "os" || d.config.os === this.os.get()) &&
				(key === "text" || d.config.text === this.text.get()) &&
				(key === "eol" || d.config.eol === this.eol.get()) &&
				(key === "core_autocrlf" ||
					d.config.core_autocrlf === this.core_autocrlf.get()) &&
				(key === "core_eol" ||
					d.config.core_eol === this.core_eol.get())
			);
		});

		return new Set(result.map((r) => JSON.stringify(r.mapping))).size > 1;
	}

	@computed get selectedEntry(): Entry | undefined {
		if (!this.entries) {
			return undefined;
		}
		const result = this.entries.find((d) => {
			return (
				d.config.os === this.os.get() &&
				d.config.text === this.text.get() &&
				d.config.eol === this.eol.get() &&
				d.config.core_autocrlf === this.core_autocrlf.get() &&
				d.config.core_eol === this.core_eol.get()
			);
		});

		return result;
	}

	constructor() {
		this.init();
	}

	private async init() {
		const data = await Promise.all(
			Object.entries(urls).map(async ([os, url]) => {
				const result = await fetch(url);
				return ((await result.json()) as []).map((v) => {
					(v as any).config.os = os;
					return v as Entry;
				});
			})
		);

		const entries = new Array<Entry>().concat(data[0], data[1]);

		if (
			!entries.every(
				(e) =>
					JSON.stringify(e.mapping.show) ===
					JSON.stringify({ lf: "lf", crlf: "crlf", mixed: "mixed" })
			)
		) {
			debugger;
		}

		if (
			!entries.every(
				(e) =>
					JSON.stringify(e.mapping.commitModifyCrLfFile) ===
					JSON.stringify(e.mapping.commitModifyMixedFile)
			)
		) {
			debugger;
		}

		if (
			!entries.every(
				(e) =>
					JSON.stringify(e.mapping.unmodified) ===
					JSON.stringify(e.mapping.commitPrependSimpleText)
			)
		) {
			debugger;
		}

		if (
			!entries.every(
				(e) =>
					JSON.stringify(e.mapping.commitModifySimpleFile) ===
					JSON.stringify(e.mapping.commitNew)
			)
		) {
			debugger;
		}

		if (
			!entries.every(
				(e) =>
					JSON.stringify(e.mapping.commitModifyLfFile) ===
					JSON.stringify(e.mapping.commitNew)
			)
		) {
			debugger;
		}

		this.entries = entries;
	}
}

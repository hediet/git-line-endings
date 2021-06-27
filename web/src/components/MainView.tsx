import * as React from "react";
import { ActiveBindableValue, Entry, LineEnding, Model } from "../model";
import classnames = require("classnames");
import { observer } from "mobx-react";
import { hotComponent } from "../utils/hotComponent";
import {
	FormGroup,
	HTMLSelect,
	Icon,
	Card,
	AnchorButton,
} from "@blueprintjs/core";
import { svg as githubSvg } from "simple-icons/icons/github";
import { svg as twitterSvg } from "simple-icons/icons/twitter";

function SVGImage(props: { src: string }) {
	return (
		<svg
			width={18}
			height={18}
			fill={"black"}
			dangerouslySetInnerHTML={{
				__html: props.src,
			}}
		/>
	);
}

@hotComponent(module)
@observer
export class MainView extends React.Component<{ model: Model }, {}> {
	render() {
		const model = this.props.model;

		return (
			<div style={{ marginLeft: 26, marginTop: 16, marginRight: 16 }}>
				<div
					className="part-Header"
					style={{
						display: "flex",
						flexWrap: "wrap-reverse",
					}}
				>
					<h1 className="bp3-heading">
						Git Line Endings Configurator
					</h1>

					<div style={{ marginLeft: "auto", display: "flex" }}>
						<div className="part-Header-Item">
							<AnchorButton
								icon={<SVGImage src={githubSvg} />}
								href="https://github.com/hediet/git-line-endings"
							>
								Github
							</AnchorButton>
						</div>
						<div
							className="part-Header-Item"
							style={{ padding: 0, marginLeft: 8 }}
						>
							<AnchorButton
								icon={<SVGImage src={twitterSvg} />}
								href="https://twitter.com/intent/tweet?url=https%3A%2F%2Fhediet.github.io%2Fgit-line-endings%2F&via=hediet_dev&text=Try%20this%20interactive%20tool%20to%20master%20all%20the%20settings%20for%20Git%20line%20endings%21"
							>
								Twitter
							</AnchorButton>
						</div>
					</div>
				</div>

				<ConfigView model={model} />

				<MappingView model={this.props.model} />

				<h2 className="bp3-heading">Git Settings</h2>

				<pre className="bp3-code-block">{model.gitConfigCommands}</pre>
				<h2 className="bp3-heading">.gitconfig</h2>
				<pre className="bp3-code-block">
					{model.gitAttributeContent}
				</pre>
			</div>
		);
	}
}

@observer
export class ConfigView extends React.Component<{ model: Model }, {}> {
	render() {
		const model = this.props.model;

		return (
			<div style={{ display: "flex", flexWrap: "wrap" }}>
				<div style={{ display: "flex", flexWrap: "wrap" }}>
					<FormGroup
						helperText=".gitattributes"
						label="Text Detection"
						labelFor="text-select"
						style={{ marginRight: 24 }}
					>
						<BoundSelect
							id="text-select"
							value={model.text}
							options={[
								"undefined" as const,
								"auto" as const,
								"false" as const,
								"true" as const,
								"binary" as const,
							]}
							getText={(v) =>
								({
									undefined: "(not set)",
									auto: "text=auto",
									false: "-text",
									true: "text",
									binary: "binary",
								}[v])
							}
						/>
					</FormGroup>
					<FormGroup
						helperText=".gitattributes"
						label="Line Break"
						labelFor="eol-select"
						style={{ marginRight: 24 }}
					>
						<BoundSelect
							id="eol-select"
							value={model.eol}
							options={[
								"undefined" as const,
								"crlf" as const,
								"lf" as const,
							]}
							getText={(v) =>
								({
									undefined: "(not set)",
									crlf: "eol=crlf",
									lf: "eol=lf",
								}[v])
							}
						/>
					</FormGroup>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap" }}>
					<FormGroup
						helperText="core.eol"
						label="End Of Line"
						labelFor="core-eol-select"
						style={{ marginRight: 24 }}
					>
						<BoundSelect
							id="core-eol-select"
							value={model.core_eol}
							options={[
								"crlf" as const,
								"lf" as const,
								"native" as const,
							]}
							getText={(v) =>
								({
									crlf: "crlf",
									lf: "lf",
									native: "native",
								}[v])
							}
						/>
					</FormGroup>
					<FormGroup
						helperText="Operating System"
						label="OS"
						labelFor="os-select"
						style={{ marginRight: 24 }}
					>
						<BoundSelect
							id="os-select"
							value={model.os}
							options={["unix" as const, "windows" as const]}
							getText={(v) =>
								({
									unix: "Linux / Mac OS",
									windows: "Windows",
								}[v])
							}
						/>
					</FormGroup>
					<FormGroup
						helperText="core.autocrlf"
						label="Auto CR LF"
						labelFor="core-autocrlf-select"
						style={{ marginRight: 24 }}
					>
						<BoundSelect
							id="core-autocrlf-select"
							value={model.core_autocrlf}
							options={["false" as const, "true" as const]}
							getText={(v) =>
								({
									false: "false",
									true: "true",
								}[v])
							}
						/>
					</FormGroup>
				</div>
			</div>
		);
	}
}

@observer
export class BoundSelect<T> extends React.Component<{
	value: ActiveBindableValue<T>;
	options: T[];
	id?: string;
	getText: (value: T) => string;
}> {
	render() {
		return (
			<HTMLSelect
				style={{
					color: this.props.value.enabled ? undefined : "lightgray",
				}}
				title={
					!this.props.value.enabled
						? "This setting does not affect the result"
						: undefined
				}
				id={this.props.id}
				value={`${this.props.options.indexOf(this.props.value.get())}`}
				onChange={(e) =>
					this.props.value.set(
						this.props.options[
							Number.parseInt(e.target.value, 10)
						] as any
					)
				}
			>
				{this.props.options.map((o, idx) => (
					<option key={idx} value={`${idx}`}>
						{this.props.getText(o)}
					</option>
				))}
			</HTMLSelect>
		);
	}
}

@observer
export class MappingView extends React.Component<{ model: Model }, {}> {
	render() {
		const model = this.props.model;

		const entry = model.selectedEntry;

		if (!entry) {
			return <div>No Data</div>;
		}

		return (
			<div style={{ display: "flex", flexWrap: "wrap" }}>
				<MappingGroup
					fromTitle="HEAD"
					toTitle="Working Directory"
					caption="git clone"
					description="line endings in the working directory after cloning a repository"
					group={entry.mapping.clone}
				/>

				<MappingGroup
					fromTitle="Working Directory"
					toTitle="HEAD"
					caption="git commit"
					description="line endings in new files (or modified files that had no CR LF line breaks before) in HEAD"
					group={entry.mapping.commitModifySimpleFile}
				/>
				<MappingGroup
					fromTitle="Working Directory"
					toTitle="HEAD"
					caption="git commit"
					description="line endings in modified files that already had some CR LF line breaks in HEAD"
					group={entry.mapping.commitModifyCrLfFile}
				/>
			</div>
		);
	}
}

function MappingGroup(props: {
	group: Entry["mapping"]["clone"];
	caption: string;
	description: string;
	fromTitle: string;
	toTitle: string;
}) {
	return (
		<Card style={{ marginRight: 16, marginBottom: 16, width: 275 }}>
			<h2 className="bp3-heading" style={{ fontFamily: "monospace" }}>
				{props.caption}
			</h2>
			<div style={{ height: 55, textAlign: "justify" }}>
				{props.description}
			</div>
			<div
				style={{
					marginRight: 16,
					marginTop: 8,
					display: "flex",
					justifyContent: "center",
				}}
			>
				<div>
					<div
						style={{
							display: "flex",
							marginTop: 4,
							marginBottom: 6,
							height: 35,
						}}
					>
						<div
							className="bp3-text-muted bp3-text-small"
							style={{
								marginTop: 4,
								marginBottom: 4,
								width: 45,
								textAlign: "center",
								display: "flex",
								alignItems: "center",
							}}
						>
							<div>{props.fromTitle}</div>
						</div>
						<div style={{ width: 24 + 24 + 16 }} />
						<div
							className="bp3-text-muted bp3-text-small"
							style={{
								marginTop: 4,
								marginBottom: 4,
								width: 45,
								textAlign: "center",
								display: "flex",
								alignItems: "center",
							}}
						>
							<div>{props.toTitle}</div>
						</div>
					</div>

					<Mapping from={"lf"} to={props.group.lf} />

					<Mapping from={"crlf"} to={props.group.crlf} />

					<Mapping from={"mixed"} to={props.group.mixed} />
				</div>
			</div>
		</Card>
	);
}

function Mapping(props: { from: LineEnding; to: LineEnding }) {
	function getText(ending: LineEnding) {
		if (ending === "crlf") {
			return (
				<>
					<span className="lineEndingSymbol CRLF">CR</span>{" "}
					<span className="lineEndingSymbol CRLF">LF</span>
				</>
			);
		} else if (ending === "lf") {
			return <span className="lineEndingSymbol LF">LF</span>;
		} else if (ending === "mixed") {
			return <span>Mixed</span>;
		} else {
			throw new Error();
		}
	}

	return (
		<div style={{ display: "flex", marginTop: 4, marginBottom: 4 }}>
			<div style={{ marginTop: 4, marginBottom: 4, width: 44 }}>
				{getText(props.from)}
			</div>
			<div style={{ width: 24 }} />
			<Icon
				style={{ marginTop: 4, marginBottom: 4 }}
				icon="arrow-right"
			/>
			<div style={{ width: 24 }} />
			<div style={{ marginTop: 4, marginBottom: 4, width: 44 }}>
				{getText(props.to)}
			</div>
		</div>
	);
}

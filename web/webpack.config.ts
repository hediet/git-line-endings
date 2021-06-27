import * as webpack from "webpack";
import path = require("path");
import HtmlWebpackPlugin = require("html-webpack-plugin");

const r = (file: string) => path.resolve(__dirname, file);

module.exports = {
	entry: [r("src/index.tsx")],
	output: { path: r("dist") },
	resolve: {
		extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
	},
	devtool: "source-map",
	devServer: {
		transportMode: "ws",
	},
	module: {
		rules: [
			{ test: /\.css$/, use: ["style-loader", "css-loader"] },
			{
				test: /\.scss$/,
				use: ["style-loader", "css-loader", "sass-loader"],
			},
			{
				test: /\.(jpe?g|png|gif|eot|ttf|svg|woff|woff2|md)$/i,
				loader: "file-loader",
			},
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
				options: { transpileOnly: true },
			},
		],
	},
	plugins: [
		new webpack.DefinePlugin({
			"process.env": "{}",
			global: {},
		}),
		new HtmlWebpackPlugin({
			templateContent: `
<!DOCTYPE html>
<html>
	<head>
	<meta charset="utf-8">
	<title>Git Line Endings Configurator</title>
	</head>
	<body>
	</body>
</html>`,
		}),
	],
} as webpack.Configuration;

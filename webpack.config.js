const path = require('path');
const webpack = require('webpack');

process.env = {};

require('dotenv').config({ path: './.env' }); 

module.exports = env => ({
    mode: env.mode,
    entry: './src/Bot.ts',
    output: {
        filename: `${env.mode}.bundle.js`,
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: {
        extensions: [".ts", ".js"],
        fallback: {
            "events": require.resolve("events/")
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            "process.env": JSON.stringify({ ...process.env, mode: env.mode })
        })
    ]
});
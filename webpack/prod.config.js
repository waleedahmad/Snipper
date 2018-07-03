const webpack = require('webpack');
const path = require('path');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const MinifyPlugin = require('babel-minify-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  context: path.join(__dirname, '../app'),
  devtool: 'source-map',
  entry: {
    app: [
        './src/main/components/App.js',
    ],
  },
  output: {
    path: path.resolve(__dirname, '../app/build'),
    filename: 'app.bundle.js',
  },
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      use: {
        loader: 'babel-loader',
      },
    },
    {
      test: /\.scss$/,
      use: ExtractTextPlugin.extract({
        fallback: 'style-loader',
        use: ['css-loader', 'sass-loader'],
      }),
    },
    {
      test: /\.(png|jpg|gif)$/,
      use: [{
        loader: 'file-loader',
        options: {
          outputPath: 'images/',
        },
      }],
    },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production'),
      },
    }),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new webpack.optimize.AggressiveMergingPlugin(),
    new webpack.optimize.OccurrenceOrderPlugin(),
    new MinifyPlugin(),
    new ExtractTextPlugin('css/main.css'),
    new webpack.IgnorePlugin(/vertx/),
    new webpack.IgnorePlugin(/ajv/),
    new CopyWebpackPlugin([
      {
        from: './src/main/app.js',
        to: path.join(__dirname, '../app/build'),
      },
      {
        from: './src/main/index.html',
        to: path.join(__dirname, '../app/build'),
      },
    ]),
  ],
  target: 'electron-main',
  node : {
      __dirname: false
  }
};

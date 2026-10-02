const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './dist/index.js', // Use the compiled TypeScript output
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'runtime.umd.js',
    library: 'MJReactRuntime',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  mode: 'production',
  target: 'web',
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      // Browser polyfills for Node.js modules
      "path": require.resolve("path-browserify"),
      "fs": false,
      "crypto": false,
      "stream": false,
      "util": false,
      "buffer": false,
      "process": false
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!@memberjunction)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions', 'ie >= 11']
                }
              }]
            ]
          }
        },
        // Disable ESM's strict extension requirement for local imports
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  externals: {
    // These are expected to be available in the browser environment
    'react': {
      commonjs: 'react',
      commonjs2: 'react',
      amd: 'react',
      root: 'React'
    },
    'react-dom': {
      commonjs: 'react-dom',
      commonjs2: 'react-dom',
      amd: 'react-dom',
      root: 'ReactDOM'
    },
    '@babel/standalone': {
      commonjs: '@babel/standalone',
      commonjs2: '@babel/standalone',
      amd: '@babel/standalone',
      root: 'Babel'
    }
  },
  optimization: {
    // Minified, but with class and function names preserved.
    //
    // `MJGlobal.ClassFactory` keys every registration on `class.name` — it is how
    // `@RegisterClass(BaseEntity, 'MJ: AI Models')` finds its base class again at resolve time.
    // Terser's default mangling renames classes, so distinct classes collapse onto the same
    // identifier and registrations collide: the failure this bundle previously avoided by turning
    // minification off entirely.
    //
    // `keep_classnames` and `keep_fnames` remove the cause rather than the symptom. Everything
    // else — whitespace, dead code, local variable names — still minifies, which is where the
    // size actually is.
    //
    // This matters beyond tidiness now: the React Native app fetches this bundle at runtime to
    // render components that need a browser, so its size is a first-render wait on a phone, not
    // just a number on disk.
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
          keep_fnames: true,
          mangle: { keep_classnames: true, keep_fnames: true }
        }
      })
    ]
  },
  performance: {
    hints: false,
    maxAssetSize: 500000, // 500kb
    maxEntrypointSize: 500000
  }
};
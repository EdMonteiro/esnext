import Module from './module';
import allPlugins from './plugins/index';
import shebangRegex from 'shebang-regex';
import type { RenderedModule } from './module';
import type { VisitorOption } from 'estraverse-jsnext';
import { parse } from 'espree';
import { traverse } from 'estraverse-jsnext';

export { default as run } from './cli';
export { allPlugins as plugins };

type PluginBookendCallback = (m: Module) => ?Object;
type PluginTraversalCallback = (node: Object, module: Module, context: ?Object) => ?VisitorOption;

type Plugin = {
  begin: ?PluginBookendCallback,
  enter: ?PluginTraversalCallback,
  leave: ?PluginTraversalCallback,
  end: ?PluginBookendCallback
};

type Options = {
  plugins: Array<Plugin>,
  validate: boolean
};

export function convert(source: string, options: (Options|Array<Plugin>)={}): RenderedModule {
  if (Array.isArray(options)) {
    console.warn('convert(source, plugins) is deprecated, please call as convert(source, options)'); // eslint-disable-line no-console
    options = { plugins: options };
  }

  const { validate=true, plugins=allPlugins } = options;

  const shebangMatch = source.match(shebangRegex);

  if (shebangMatch) {
    source = source.slice(shebangMatch.index + shebangMatch[0].length);
  }

  const module = new Module(null, source);

  plugins.forEach(plugin => {
    const { begin, end, enter, leave } = plugin;
    const context = begin ? begin(module) : null;

    traverse(module.ast, {
      enter(node, parent) {
        Object.defineProperty(node, 'parentNode', {
          value: parent,
          configurable: true,
          enumerable: false
        });
        if (enter) {
          return enter(node, module, context);
        }
      },

      leave(node) {
        if (leave) {
          return leave(node, module, context);
        }
      }
    });

    if (end) {
      end(module, context);
    }
  });

  let result: RenderedModule = module.render();

  if (validate) {
    const error = validateResult(result);
    if (error) {
      result.warnings.push({
        type: 'output-validation-failure',
        message: error.description,
        node: {
          loc: {
            start: {
              line: error.lineNumber,
              column: error.column - 1
            }
          }
        }
      });
    }
  }

  if (shebangMatch) {
    result.code = shebangMatch[0] + result.code;
  }

  return result;
}

function validateResult({ code }) {
  try {
    parse(code, { sourceType: 'module' });
    return null;
  } catch (ex) {
    return ex;
  }
}

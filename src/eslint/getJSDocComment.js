/**
 * Obtained originally from {@link https://github.com/eslint/eslint/blob/master/lib/util/source-code.js#L313}
 *
 * @license MIT
 */

/**
 * Checks if the given token is a comment token or not.
 *
 * @param {Token} token - The token to check.
 * @returns {boolean} `true` if the token is a comment token.
 */
const isCommentToken = (token) => {
  return token.type === 'Line' || token.type === 'Block' || token.type === 'Shebang';
};

const decoratorMetaTokens = new Map([[')', '('], ['>', '<']]);

const getDecorator = (token, sourceCode) => {
  if (!token) {
    return false;
  }
  if (token.type === 'Punctuator') {
    const tokenClose = token.value;
    const tokenOpen = decoratorMetaTokens.get(tokenClose);
    if (tokenOpen) {
      let nested = 0;
      let tokenBefore = token;
      do {
        tokenBefore = sourceCode.getTokenBefore(tokenBefore, {includeComments: true});
        // istanbul ignore if
        if (tokenBefore && tokenBefore.type === 'Punctuator') {
          if (tokenBefore.value === tokenClose) {
            nested++;
          }
          if (tokenBefore.value === tokenOpen) {
            if (nested) {
              nested--;
            } else {
              break;
            }
          }
        }
      } while (tokenBefore);

      return tokenBefore;
    }
  }

  if (token.type === 'Identifier') {
    const tokenBefore = sourceCode.getTokenBefore(token, {includeComments: true});
    if (tokenBefore && tokenBefore.type === 'Punctuator' && tokenBefore.value === '@') {
      return tokenBefore;
    }
  }

  return false;
};

/**
 * Check to see if its a ES6 export declaration.
 *
 * @param {ASTNode} astNode An AST node.
 * @returns {boolean} whether the given node represents an export declaration.
 * @private
 */
const looksLikeExport = function (astNode) {
  return astNode.type === 'ExportDefaultDeclaration' || astNode.type === 'ExportNamedDeclaration' ||
    astNode.type === 'ExportAllDeclaration' || astNode.type === 'ExportSpecifier';
};

const getTSFunctionComment = function (astNode) {
  const {parent} = astNode;
  const grandparent = parent.parent;
  const greatGrandparent = grandparent.parent;
  const greatGreatGrandparent = greatGrandparent && greatGrandparent.parent;

  // istanbul ignore if
  if (parent.type !== 'TSTypeAnnotation') {
    return astNode;
  }

  switch (grandparent.type) {
  case 'ClassProperty':
  case 'TSDeclareFunction':
  case 'TSMethodSignature':
  case 'TSPropertySignature':
    return grandparent;
  case 'ArrowFunctionExpression':
    // istanbul ignore else
    if (
      greatGrandparent.type === 'VariableDeclarator'

    // && greatGreatGrandparent.parent.type === 'VariableDeclaration'
    ) {
      return greatGreatGrandparent.parent;
    }

    // istanbul ignore next
    return astNode;
  case 'FunctionExpression':
    // istanbul ignore else
    if (greatGrandparent.type === 'MethodDefinition') {
      return greatGrandparent;
    }

  // Fallthrough
  default:
    // istanbul ignore if
    if (grandparent.type !== 'Identifier') {
      // istanbul ignore next
      return astNode;
    }
  }

  // istanbul ignore next
  switch (greatGrandparent.type) {
  case 'ArrowFunctionExpression':
    // istanbul ignore else
    if (
      greatGreatGrandparent.type === 'VariableDeclarator' &&
      greatGreatGrandparent.parent.type === 'VariableDeclaration'
    ) {
      return greatGreatGrandparent.parent;
    }

    // istanbul ignore next
    return astNode;
  case 'FunctionDeclaration':
    return greatGrandparent;
  case 'VariableDeclarator':
    // istanbul ignore else
    if (greatGreatGrandparent.type === 'VariableDeclaration') {
      return greatGreatGrandparent;
    }

    // Fallthrough
  default:
    // istanbul ignore next
    return astNode;
  }
};

const invokedExpression = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression']);
const allowableCommentNode = new Set([
  'VariableDeclaration',
  'ExpressionStatement',
  'MethodDefinition',
  'Property',
  'ObjectProperty',
  'ClassProperty',
]);

/* eslint-disable complexity */
/**
 * Reduces the provided node to the appropriate node for evaluating JSDoc comment status.
 *
 * @param {ASTNode} node An AST node.
 * @param {SourceCode} sourceCode The ESLint SourceCode.
 * @returns {ASTNode} The AST node that can be evaluated for appropriate JSDoc comments.
 * @private
 */
const getReducedASTNode = function (node, sourceCode) {
  let {parent} = node;

  switch (node.type) {
  case 'TSFunctionType':
    return getTSFunctionComment(node);
  case 'TSInterfaceDeclaration':
  case 'TSTypeAliasDeclaration':
  case 'TSEnumDeclaration':
  case 'ClassDeclaration':
  case 'FunctionDeclaration':
    return looksLikeExport(parent) ? parent : node;

  case 'TSDeclareFunction':
  case 'ClassExpression':
  case 'ObjectExpression':
  case 'ArrowFunctionExpression':
  case 'TSEmptyBodyFunctionExpression':
  case 'FunctionExpression':
    if (
      !invokedExpression.has(parent.type)
    ) {
      while (
        !sourceCode.getCommentsBefore(parent).length &&
        !/Function/u.test(parent.type) &&
        !allowableCommentNode.has(parent.type)
      ) {
        parent = parent.parent;

        if (!parent) {
          break;
        }
      }
      if (parent && parent.type !== 'FunctionDeclaration' && parent.type !== 'Program') {
        if (parent.parent && parent.parent.type === 'ExportNamedDeclaration') {
          return parent.parent;
        }

        return parent;
      }
    }

    return node;

  default:
    return node;
  }
};

/**
 * Checks for the presence of a JSDoc comment for the given node and returns it.
 *
 * @param {ASTNode} astNode The AST node to get the comment for.
 * @returns {Token|null} The Block comment token containing the JSDoc comment
 *    for the given node or null if not found.
 * @private
 */
const findJSDocComment = (astNode, sourceCode, settings) => {
  const {minLines, maxLines} = settings;
  let currentNode = astNode;
  let tokenBefore = null;

  while (currentNode) {
    tokenBefore = sourceCode.getTokenBefore(currentNode, {includeComments: true});
    const decorator = getDecorator(tokenBefore, sourceCode);
    if (decorator) {
      currentNode = decorator;
      continue;
    }
    if (!tokenBefore || !isCommentToken(tokenBefore)) {
      return null;
    }
    if (tokenBefore.type === 'Line') {
      currentNode = tokenBefore;
      continue;
    }
    break;
  }

  if (
    tokenBefore.type === 'Block' &&
    tokenBefore.value.charAt(0) === '*' &&
    currentNode.loc.start.line - tokenBefore.loc.end.line >= minLines &&
    currentNode.loc.start.line - tokenBefore.loc.end.line <= maxLines
  ) {
    return tokenBefore;
  }

  return null;
};

/**
 * Retrieves the JSDoc comment for a given node.
 *
 * @param {SourceCode} sourceCode The ESLint SourceCode
 * @param {ASTNode} node The AST node to get the comment for.
 * @param {object} settings The settings in context
 * @returns {Token|null} The Block comment token containing the JSDoc comment
 *    for the given node or null if not found.
 * @public
 */
const getJSDocComment = function (sourceCode, node, settings) {
  const reducedNode = getReducedASTNode(node, sourceCode);

  return findJSDocComment(reducedNode, sourceCode, settings);
};

export {
  getReducedASTNode, getJSDocComment, getDecorator, findJSDocComment,
};
export default getJSDocComment;

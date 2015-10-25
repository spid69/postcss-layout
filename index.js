var postcss = require('postcss');


module.exports = postcss.plugin('postcss-layout', function (opts) {
  opts = opts || {};
  // Attach the grids to the opts object if passed in,
  // mostly so it can be readout by tests.
  opts._grids = {};
  var grids = opts._grids;
  
  return function (css, result) {
    css
      .walkAtRules('grid', function(rule) {
        // Collect grid definitions.
        processGridDef(css, result, rule, grids);
      });
    css
      .walkRules(function(rule) {
        var layout = {};

        rule.walkDecls(function(decl) {
          // Collect layout info.
          processLayoutConf(css, result, rule, decl, grids, layout);
        });

        if(layout.isSet) {
          // Make sure layouts use 'box-sizing: border-box;' for best results.
          rule.insertAfter(layout.decl, {prop: 'box-sizing', value: 'border-box', source: layout.decl.source});
          layout.childrenRule.append({prop: 'box-sizing', value: 'border-box'});

          // Stack layout.
          if(layout.values.indexOf('stack') + 1) {
            stackLayout(css, rule, layout.decl, layout.values, layout.childrenRule, layout.pseudoRule);
          }
          // Line layout.
          else if(layout.values.indexOf('lines') + 1) {
            lineLayout(css, rule, layout.decl, layout.values, layout.childrenRule, layout.pseudoRule);

            if(layout.isGridContainer) {
              gridContainer(css, rule, layout.gridContainerDecl, layout.grid);
            }
          }
          // Columns layout.
          else if(layout.values.indexOf('columns') + 1) {
            columnLayout(css, rule, layout.decl, layout.values, layout.childrenRule, layout.pseudoRule);
          }
          // Rows layout.
          else if(layout.values.indexOf('rows') + 1) {
            rowLayout(css, rule, layout.decl, layout.values, layout.childrenRule, layout.pseudoRule);
          }
          else {
            throw layout.decl.error('Unknown \'layout\' property value: ' + layout.decl.value, { plugin: 'postcss-layout' });
          }
        }

        if(layout.isGridItem) {
          gridItem(css, rule, layout.gridItemDecl, layout.grid);
        }
      });
  };
});

function processGridDef(css, result, rule, grids) {
  var params = rule.params.split(/\s*,\s*|\s/);

  // String.split always returns an array with at least one element, 
  // even if the source string is empty.
  // But the value of the first elm is an empty string, 
  // so we check the length of the first elm, 
  // if it is 0, there is no name for the grid and we return early.
  if(!params[0].length)
    return;

  // Create an entry in the grids obj with the name in params[0].
  grids[params[0]] = {};
  
  rule.walkDecls(function(decl) {
    // Add the props from the rule to the grids obj with key from params[0].
    grids[params[0]][decl.prop] = decl.value;

    // Split gutter val into horizontal and vertical.
    if(decl.prop == 'gutter') {
      var gutter = decl.value.split(/\s*,\s*|\s/);

      grids[params[0]]['gutterH'] = gutter[0];
      grids[params[0]]['gutterV'] = gutter[1] || null;
    }
  });

  // If the grid is missing count, delete it.
  if(!grids[params[0]].count)
    delete(grids[params[0]]);

  // Remove the @rule from the result CSS, it is not needed in the result.
  rule.remove();
}

function processLayoutConf(css, result, rule, decl, grids, layout) {
  // Look for layout prop in rule.
  if(decl.prop == 'layout') {
    var sels = [];
    layout.childrenRule = null;
    layout.pseudoRule = null;
    layout.values = decl.value.split(/\s*,\s*|\s/);
    // console.log(layoutValues);
    
    for (var i = 0; i < rule.selectors.length; i++) {
      sels.push(rule.selectors[i] + ' > *');
    };

    layout.childrenRule = layoutRule = postcss.rule({selector: sels.join(', '), source: decl.source});
    sels = [];

    for (var i = 0; i < rule.selectors.length; i++) {
      sels.push(rule.selectors[i] + ':before');
    };

    layout.pseudoRule = postcss.rule({selector: sels.join(', '), source: decl.source});

    layout.isSet = true;
    layout.decl = decl;
  }
  // Look for grid prop in rule.
  else if(decl.prop == 'grid') {
    var grid = null;
    var gridName = decl.value;
    grid = gridName ? grids[gridName] : null;

    if(!grid) {
      throw decl.error('Undefined grid: ' + decl.value, { plugin: 'postcss-layout' });
    }

    layout.isGridContainer = true;
    layout.gridContainerDecl = decl;
    layout.grid = grid;
  }
  // Look for grid control props like span.
  else if(decl.prop.indexOf('span') + 1) {
    // console.log(decl.prop, decl.value);
    var grid = null;
    // TODO: Do a suffix check on '-span' instead of just a split on '-',
    // in case the gridName has a '-' in it.
    var gridName = decl.prop.split('-');
    gridName = gridName.length == 2 ? gridName[0] : null;
    grid = gridName ? grids[gridName] : null;

    if(!grid) {
      throw decl.error('Unknown grid name in span property: ' + decl.prop, { plugin: 'postcss-layout' });
    }

    layout.isGridItem = true;
    layout.gridItemDecl = decl;
    layout.grid = grid;
  }
}

function stackLayout(css, rule, decl, layoutValues, layoutRule, layoutPseudo) {
  css.insertAfter(rule, layoutRule);

  // Sizing, expand-to-fill container or shrink-to-fit content (horizontally).
  if(layoutValues.indexOf('shrink') + 1) {
    layoutRule.append({prop: 'display', value: 'table'});
  }
  else {
    layoutRule.append({prop: 'display', value: 'block'});
  }

  // Alignment.
  if(layoutValues.indexOf('left') + 1) {
    // layoutRule.append({prop: 'margin', value: '0 auto 0 0'});
    layoutRule.append({prop: 'margin-right', value: 'auto'});
  }
  else if(layoutValues.indexOf('right') + 1) {
    // layoutRule.append({prop: 'margin', value: '0 0 0 auto'});
    layoutRule.append({prop: 'margin-left', value: 'auto'});
  }
  // else if(layoutValues.indexOf('center') + 1) {
  else {
    // layoutRule.append({prop: 'margin', value: '0 auto'});
    layoutRule.append({prop: 'margin-left', value: 'auto'});
    layoutRule.append({prop: 'margin-right', value: 'auto'});
  }

  // Remove 'layout' property from result.
  decl.remove();

  return;
}

function lineLayout(css, rule, decl, layoutValues, layoutRule, layoutPseudo) {
  var i = null;
  layoutPseudo.append({prop: 'position', value: 'relative'});
  layoutPseudo.append({prop: 'content', value: '""'});
  layoutPseudo.append({prop: 'display', value: 'inline-block'});
  layoutPseudo.append({prop: 'width', value: '0'});
  layoutPseudo.append({prop: 'height', value: '100%'});
  layoutPseudo.append({prop: 'vertical-align', value: 'middle'});
  layoutRule.append({prop: 'display', value: 'inline-block'});
  layoutRule.append({prop:'text-align', value: 'initial'});
  
  css.insertAfter(rule, layoutPseudo);
  css.insertAfter(rule, layoutRule);
  
  // Horizontal alignment.
  i = layoutValues.indexOf('left') + 1 || layoutValues.indexOf('right') + 1 || layoutValues.indexOf('center') + 1;
  if(i) {
    rule.insertAfter(decl, {prop: 'text-align', value: layoutValues[i - 1], source: decl.source});
  }
  
  // Vertical alignment.
  i = layoutValues.indexOf('top') + 1 || layoutValues.indexOf('bottom') + 1 || layoutValues.indexOf('middle') + 1;
  if(i) {
    layoutRule.append({prop: 'vertical-align', value: layoutValues[i - 1], source: decl.source});
  }

  // Remove the 'layout' property from the result.
  decl.remove();
  
  return;
}

function columnLayout(css, rule, decl, layoutValues, layoutRule, layoutPseudo) {
  css.insertAfter(rule, layoutRule);

  rule.insertAfter(decl, {prop: 'display', value: 'table', source: decl.source});
  rule.insertAfter(decl, {prop: 'table-layout', value: 'fixed', source: decl.source});
  rule.insertAfter(decl, {prop: 'width', value: '100%', source: decl.source});
  layoutRule.append({prop: 'display', value: 'table-cell'});

  // Remove the 'layout' property from the result.
  decl.remove();

  return;
}

function rowLayout(css, rule, decl, layoutValues, layoutRule, layoutPseudo) {
  css.insertAfter(rule, layoutRule);

  rule.insertAfter(decl, {prop: 'display', value: 'table', source: decl.source});
  rule.insertAfter(decl, {prop: 'table-layout', value: 'fixed', source: decl.source});
  rule.insertAfter(decl, {prop: 'width', value: '100%', source: decl.source});
  layoutRule.append({prop: 'display', value: 'table-row'});

  // Remove the 'layout' property from the result.
  decl.remove();

  return;
}

function gridContainer(css, rule, decl, grid) {
  var gutterH = grid.gutterH ? grid.gutterH.match(/(\d+)(\D*)/) : [0, 0];
  var gutterHUnits = gutterH[2] || '';
  var marginH = Number(gutterH[1]) ? '-' + gutterH[1]/2 + gutterHUnits : 0;

  var gutterV = grid.gutterV ? grid.gutterV.match(/(\d+)(\D*)/) : [0, 0];
  var gutterVUnits = gutterV[2] || '';
  var marginV = Number(gutterV[1]) ? '-' + gutterV[1]/2 + gutterVUnits : 0;

  if(marginH) {
    rule.insertAfter(decl, {prop:'margin-left', value: marginH, source: decl.source});
    rule.insertAfter(decl, {prop:'margin-right', value: marginH, source: decl.source});
  }
  if(marginV) {
    rule.insertAfter(decl, {prop:'margin-top', value: marginV, source: decl.source});
    rule.insertAfter(decl, {prop:'margin-bottom', value: marginV, source: decl.source});
  }

  // Remove 'grid' property.
  decl.remove();
}

function gridItem(css, rule, decl, grid) {
  var gutterH = grid.gutterH ? grid.gutterH.match(/(\d+)(\D*)/) : [0, 0];
  var gutterHUnits = gutterH[2] || '';
  var marginH = Number(gutterH[1]) ? gutterH[1]/2 + gutterHUnits : 0;

  var gutterV = grid.gutterV ? grid.gutterV.match(/(\d+)(\D*)/) : [0, 0];
  var gutterVUnits = gutterV[2] || '';
  var marginV = Number(gutterV[1]) ? gutterV[1]/2 + gutterVUnits : 0;

  var width = grid.count ? 100/grid.count * decl.value + '%' : 'auto';
  var calc = marginH ? 'calc(' + width + ' - ' + grid.gutterH + ')' : width;

  // console.log(marginV);

  if(width != 'auto')
    rule.insertAfter(decl, {prop:'width', value: calc, source: decl.source});
  if(marginH) {
    rule.insertAfter(decl, {prop:'margin-left', value: marginH, source: decl.source});
    rule.insertAfter(decl, {prop:'margin-right', value: marginH, source: decl.source});
  }
  if(marginV) {
    rule.insertAfter(decl, {prop:'margin-top', value: marginV, source: decl.source});
    rule.insertAfter(decl, {prop:'margin-bottom', value: marginV, source: decl.source});
  }

  // Remove the 'span' property from the result.
  decl.remove();

  return;
}
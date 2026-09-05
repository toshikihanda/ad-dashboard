import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function transpile(path) {
    return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
}

function runModule(path, requireFn, processEnv = {}) {
    const sandbox = {
        module: { exports: {} },
        exports: {},
        require: requireFn,
        console,
        process: { env: processEnv },
    };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(transpile(path), sandbox);
    return sandbox.module.exports;
}

const financialAccess = runModule(
    'src/lib/financialAccess.ts',
    () => ({})
);

const visibilityCases = [
    ['', true],
    [undefined, true],
    ['true', true],
    ['FALSE', false],
    ['0', false],
    ['非表示', false],
];

for (const [input, expected] of visibilityCases) {
    assert.equal(financialAccess.parseFinancialVisibility(input), expected);
}

const originalRow = {
    Revenue: 123456,
    Gross_Profit: 23456,
    Cost: 100000,
    Campaign_Name: 'URARAクリニック_ih',
};
const [redactedRow] = financialAccess.redactFinancialData([originalRow]);
assert.equal(redactedRow.Revenue, 0);
assert.equal(redactedRow.Gross_Profit, 0);
assert.equal(redactedRow.Cost, 100000);
assert.equal(originalRow.Revenue, 123456, 'source data must not be mutated');

let sheetRows = [];
const accessControl = runModule(
    'src/lib/accessControl.ts',
    id => {
        if (id === './financialAccess') return financialAccess;
        if (id === './googleSheets') return { loadSheetData: async () => sheetRows };
        return {};
    },
    { LOGIN_KEY: 'admin-test-key' }
);

sheetRows = [{
    key: 'urara-test-key',
    allowed_projects: 'URARAクリニック_ih',
    status: 'active',
    show_financials: 'false',
}];
const uraraAccess = await accessControl.resolveCampaignAccessFromSheet('urara-test-key');
assert.deepEqual(
    JSON.parse(JSON.stringify(uraraAccess)),
    { allowedCampaigns: ['URARAクリニック_ih'], canViewFinancials: false }
);

sheetRows = [{
    key: 'legacy-test-key',
    allowed_projects: 'チュアブル_予算',
    status: 'active',
}];
const legacyAccess = await accessControl.resolveCampaignAccessFromSheet('legacy-test-key');
assert.equal(legacyAccess.canViewFinancials, true, 'blank column preserves existing behavior');

const adminAccess = await accessControl.resolveCampaignAccessFromSheet('admin-test-key');
assert.equal(adminAccess.canViewFinancials, true);
assert.deepEqual(Array.from(adminAccess.allowedCampaigns), ['*']);

console.log('Access control tests passed: 14');

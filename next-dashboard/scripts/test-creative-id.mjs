import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadDataProcessor() {
    const source = fs.readFileSync('src/lib/dataProcessor.ts', 'utf8');
    const outputText = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const sandbox = { module: { exports: {} }, exports: {}, require, console };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(outputText, sandbox);
    return sandbox.module.exports;
}

const { extractCreativeFromAdName, processData } = loadDataProcessor();

const extractionCases = [
    ['60_106_288', '288'],
    ['60_106_288b', '288b'],
    ['60_106_288AB', '288ab'],
    ['60_229_107', '107'],
    ['SAC_219_g', '219_g'],
    ['SAC 219g', '219g'],
    ['bt005_001', 'bt005'],
    ['', ''],
];

for (const [input, expected] of extractionCases) {
    assert.equal(extractCreativeFromAdName(input), expected, input || '(empty)');
}

const projectNameKey = '\u7ba1\u7406\u7528\u6848\u4ef6\u540d';
const metaNameKey = 'Meta\u540d';
const beyondNameKey = 'Beyond\u540d';
const operationTypeKey = '\u904b\u7528\u30bf\u30a4\u30d7';
const budgetType = '\u4e88\u7b97';
const unitPriceKey = '\u6210\u679c\u5358\u4fa1';
const feeRateKey = '\u624b\u6570\u6599\u7387';
const metaCvNameKey = 'Meta CV\u540d';
const churable = '\u30c1\u30e5\u30a2\u30d6\u30eb';

function createMasterSetting(projectName, keyword) {
    return {
        [projectNameKey]: projectName,
        [metaNameKey]: keyword,
        [beyondNameKey]: keyword,
        [operationTypeKey]: budgetType,
        [unitPriceKey]: '0',
        [feeRateKey]: '12%',
        [metaCvNameKey]: 'Results',
    };
}

const processed = processData({
    Master_Setting: [
        createMasterSetting('SAC_budget', 'SAC'),
        createMasterSetting(`${churable}_budget`, churable),
    ],
    Meta_Live: [
        {
            Day: '2026-08-08',
            'Ad Name': 'SAC_60_106_288b',
            'Account Name': '',
            'Amount Spent': '100',
            Impressions: '10',
            'Link Clicks': '1',
            Results: '0',
        },
        {
            Day: '2026-08-08',
            'Ad Name': `${churable}_1_4_003`,
            'Account Name': '',
            'Amount Spent': '100',
            Impressions: '10',
            'Link Clicks': '1',
            Results: '0',
        },
    ],
    Meta_History: [],
    Beyond_Live: [
        {
            date_jst: '2026-08-08',
            beyond_page_name: 'SAC',
            parameter: 'utm_creative=60_106_288b',
            cost: '100',
            cv: '0',
            pv: '1',
            click: '1',
        },
        {
            date_jst: '2026-08-08',
            beyond_page_name: churable,
            parameter: 'utm_creative=1_4_003',
            cost: '100',
            cv: '0',
            pv: '1',
            click: '1',
        },
    ],
    Beyond_History: [],
});

const integrationCases = [
    ['SAC_budget', 'Meta', '288b'],
    [`${churable}_budget`, 'Meta', '4_003'],
    ['SAC_budget', 'Beyond', '288b'],
    [`${churable}_budget`, 'Beyond', '4_003'],
];

for (const [campaign, media, expected] of integrationCases) {
    const row = processed.find(item => item.Campaign_Name === campaign && item.Media === media);
    assert.equal(row?.creative_value, expected, `${campaign}/${media}`);
}

console.log(`Creative ID tests passed: ${extractionCases.length + integrationCases.length}`);

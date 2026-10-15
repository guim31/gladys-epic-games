// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the feature names and the four documentation files, which share the
// same sections. German says "du", never the polite "Sie"; Spanish says
// "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import {
  FEATURE_NAMES,
  FROM,
  MESSAGES,
  REFRESH_FAILED,
  REFRESH_REPORT,
  SUMMARY,
  TEXT,
  UNTIL,
} from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;
// Spanish "tú" forms the texts must not use (usted is the rule).
const FAMILIAR_SPANISH = /(?<!\p{L})(tú|tu|tus|te|ti|contigo|puedes|tienes|quieres)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  if (lang === 'es' && FAMILIAR_SPANISH.test(text)) {
    found.push(`${path} uses "tú" instead of "usted": "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' ||
        /^manifest\.(widgets|scene_triggers)\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(FEATURE_NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 25, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, and the catalog description holds 10 characters at least', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('every message of the code has the four languages', () => {
  const found = [
    ...Object.entries(TEXT).flatMap(([key, value]) => problems(value, `TEXT.${key}`, MAX.short)),
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the sentences built by the code exist in every language', () => {
  const date = 'Thu 22 Oct, 17:00';
  const render = {
    UNTIL: (fn) => fn(date),
    FROM: (fn) => fn(date),
    SUMMARY: (fn) => fn(2, 1),
    REFRESH_FAILED: (fn) => fn('x'.repeat(100)),
  };
  const found = [];
  for (const [name, table] of Object.entries({ UNTIL, FROM, SUMMARY, REFRESH_FAILED })) {
    const value = Object.fromEntries(
      Object.entries(table).map(([lang, fn]) => [lang, render[name](fn)]),
    );
    found.push(...problems(value, name, MAX.message));
  }
  assert.deepEqual(found, []);
});

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(value, `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the feature names exist in every language, distinct on the device', () => {
  assert.deepEqual(tableProblems(FEATURE_NAMES, 'FEATURE_NAMES', MAX.featureName), []);
  for (const lang of LANGS) {
    const names = Object.values(FEATURE_NAMES[lang]);
    assert.equal(new Set(names).size, names.length, `${lang}: two features share a name`);
  }
  assert.deepEqual(tableProblems(REFRESH_REPORT, 'REFRESH_REPORT', MAX.short), []);
});

// --- Documentation ---------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The outline of a Markdown file: the level of each heading, in order. */
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentation files exist, with the same sections', () => {
  const reference = outline(docs.en);
  // Presentation, requirements, configuration, device, widget, trigger,
  // scene examples, troubleshooting, limitations.
  assert.equal(reference.filter((level) => level === 2).length, 8);
  for (const lang of LANGS) {
    assert.deepEqual(
      outline(docs[lang]),
      reference,
      `docs/${lang}.md does not have the sections of docs/en.md`,
    );
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('the documentation says it is unofficial and developed without the live API', () => {
  assert.match(docs.en, /not affiliated with Epic Games/);
  assert.match(docs.fr, /sans lien avec Epic Games/);
  assert.match(docs.de, /keine Verbindung zu Epic Games/);
  assert.match(docs.es, /sin relación con Epic Games/);
  assert.match(docs.en, /Developed without access to the live API/);
  assert.match(docs.fr, /Développée sans accès à l'API réelle/);
  assert.match(docs.de, /Ohne Zugriff auf die echte API entwickelt/);
  assert.match(docs.es, /Desarrollada sin acceso a la API real/);
});

test('the German documentation says "du", the Spanish one "usted"', () => {
  const germanLines = docs.de.split('\n').filter((line) => POLITE_GERMAN.test(line));
  assert.deepEqual(germanLines, []);
  const spanishLines = docs.es.split('\n').filter((line) => FAMILIAR_SPANISH.test(line));
  assert.deepEqual(spanishLines, []);
});

test('the guard catches a missing language, an empty text and the wrong forms of address', () => {
  assert.equal(problems({ en: 'Free', fr: 'Gratuit', de: 'Gratis' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'Puedes elegir' }, 'x', 60).length, 1);
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[2].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[2].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
  // Docs with a missing section are found.
  assert.notDeepEqual(outline(docs.en.replace('## Limitations', '')), outline(docs.en));
});

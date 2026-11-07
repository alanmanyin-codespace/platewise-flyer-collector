import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batchRecipes, importRecipes, mapMeal } from '../dist/recipes.js';

const meal = (id, over = {}) => ({ idMeal: id, strMeal: ' Bubble & Squeak', strCategory: 'Pork', strArea: 'British', strInstructions: 'Fry.', strMealThumb: 'https://x.test/a.jpg', strYoutube: '', strSource: null, dateModified: null, strIngredient1: 'Potatoes', strMeasure1: '2 ', strIngredient2: ' ', strMeasure2: ' ', strIngredient3: null, ...over });

test('maps a meal, trimming text and dropping empty ingredient slots', () => {
  assert.deepEqual(mapMeal(meal('1')), { sourceId: '1', title: 'Bubble & Squeak', category: 'Pork', area: 'British', instructions: 'Fry.', imageUrl: 'https://x.test/a.jpg', youtubeUrl: null, sourceUrl: null, modifiedAt: null, ingredients: [{ name: 'Potatoes', measure: '2' }] });
});

test('batches by count and bytes', () => {
  const r = id => mapMeal(meal(String(id), { strInstructions: 'x'.repeat(30000) }));
  assert.deepEqual(batchRecipes([1, 2, 3, 4].map(r)).map(b => b.length), [3, 1]);
  assert.deepEqual(batchRecipes(Array.from({ length: 30 }, (_, i) => mapMeal(meal(String(i))))).map(b => b.length), [25, 5]);
});

test('imports only new recipes unless refreshing', async () => {
  const fetched = [];
  const source = { listIds: async () => ['1', '2', '3'], getMeal: async id => { fetched.push(id); return meal(id); } };
  const uploads = [];
  const api = { knownIds: async () => ['1'], upload: async batch => { uploads.push(batch.map(r => r.sourceId)); } };
  assert.deepEqual(await importRecipes(source, api, { refresh: false, delayMs: 0 }), { listed: 3, known: 1, imported: 2 });
  assert.deepEqual(fetched, ['2', '3']);
  assert.deepEqual(uploads, [['2', '3']]);
  fetched.length = 0;
  assert.equal((await importRecipes(source, api, { refresh: true, delayMs: 0 })).imported, 3);
  assert.deepEqual(fetched, ['1', '2', '3']);
});

// TheMealDB catalogue import. Free key "1" is for development; set THEMEALDB_KEY to a paid key for production.
export type Meal = Record<string, string | null | undefined>;
export interface Recipe {
  sourceId: string; title: string; category: string | null; area: string | null; instructions: string | null;
  imageUrl: string | null; youtubeUrl: string | null; sourceUrl: string | null; modifiedAt: string | null;
  ingredients: { name: string; measure: string | null }[];
}
export interface RecipeSource { listIds(): Promise<string[]>; getMeal(id: string): Promise<Meal | null> }
export interface RecipeApi { knownIds(): Promise<string[]>; upload(batch: Recipe[]): Promise<void> }

const MAX_BATCH = 25;
const MAX_BYTES = 95000;
const text = (v: string | null | undefined) => v?.trim() || null;

export function mapMeal(meal: Meal): Recipe {
  const ingredients: Recipe["ingredients"] = [];
  for (let i = 1; i <= 20; i++) {
    const name = text(meal[`strIngredient${i}`]);
    if (name) ingredients.push({ name, measure: text(meal[`strMeasure${i}`]) });
  }
  return { sourceId: String(meal.idMeal), title: text(meal.strMeal) ?? "", category: text(meal.strCategory), area: text(meal.strArea), instructions: text(meal.strInstructions), imageUrl: text(meal.strMealThumb), youtubeUrl: text(meal.strYoutube), sourceUrl: text(meal.strSource), modifiedAt: text(meal.dateModified), ingredients };
}

export function batchRecipes(recipes: Recipe[]): Recipe[][] {
  const batches: Recipe[][] = [];
  let current: Recipe[] = [];
  let bytes = 0;
  for (const recipe of recipes) {
    const size = new TextEncoder().encode(JSON.stringify(recipe)).byteLength;
    if (current.length && (current.length === MAX_BATCH || bytes + size > MAX_BYTES)) { batches.push(current); current = []; bytes = 0; }
    current.push(recipe);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Uploads as it goes, so a failed import keeps its progress and a rerun picks up the rest.
export async function importRecipes(source: RecipeSource, api: RecipeApi, options: { refresh: boolean; delayMs: number }): Promise<{ listed: number; known: number; imported: number }> {
  const ids = await source.listIds();
  const known = new Set(await api.knownIds());
  const wanted = options.refresh ? ids : ids.filter(id => !known.has(id));
  let imported = 0;
  for (let i = 0; i < wanted.length; i += MAX_BATCH) {
    const recipes: Recipe[] = [];
    for (const id of wanted.slice(i, i + MAX_BATCH)) {
      const meal = await source.getMeal(id);
      if (meal) recipes.push(mapMeal(meal));
      if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
    }
    for (const batch of batchRecipes(recipes)) { await api.upload(batch); imported += batch.length; }
  }
  return { listed: ids.length, known: known.size, imported };
}

export function mealDbSource(key: string, request: typeof fetch = fetch): RecipeSource {
  const get = async (path: string) => {
    const response = await request(`https://www.themealdb.com/api/json/v1/${encodeURIComponent(key)}/${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`TheMealDB request failed (HTTP ${response.status}).`);
    return await response.json() as { meals: Meal[] | string | null };
  };
  const list = (data: { meals: Meal[] | string | null }) => Array.isArray(data.meals) ? data.meals : [];
  return {
    async listIds() {
      const ids = new Set<string>();
      for (const category of list(await get("list.php?c=list"))) {
        for (const meal of list(await get(`filter.php?c=${encodeURIComponent(String(category.strCategory))}`))) ids.add(String(meal.idMeal));
      }
      return [...ids];
    },
    async getMeal(id) { return list(await get(`lookup.php?i=${encodeURIComponent(id)}`))[0] ?? null; },
  };
}

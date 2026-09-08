/**
 * Seed the database with a couple of authentic French texts so you can
 * try the Library + Reader immediately. Idempotent — only inserts texts
 * that aren't already present (matched by title).
 *
 *   npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { documents, type NewDocument } from "../src/lib/db/schema";
import { countWords, naiveLevelEstimate } from "../src/lib/cefr";
import { LEGACY_OWNER_ID } from "../src/lib/db/constants";

type Seed = Omit<NewDocument, "id" | "userId" | "wordCount" | "estimatedLevel">;

const SEEDS: Seed[] = [
  {
    title: "Le Corbeau et le Renard",
    source: "Jean de La Fontaine, Fables (1668) — domaine public",
    type: "literature",
    content: `Maître Corbeau, sur un arbre perché,
Tenait en son bec un fromage.
Maître Renard, par l'odeur alléché,
Lui tint à peu près ce langage :
« Hé ! bonjour, Monsieur du Corbeau.
Que vous êtes joli ! que vous me semblez beau !
Sans mentir, si votre ramage
Se rapporte à votre plumage,
Vous êtes le Phénix des hôtes de ces bois. »

À ces mots le Corbeau ne se sent pas de joie ;
Et pour montrer sa belle voix,
Il ouvre un large bec, laisse tomber sa proie.
Le Renard s'en saisit, et dit : « Mon bon Monsieur,
Apprenez que tout flatteur
Vit aux dépens de celui qui l'écoute.
Cette leçon vaut bien un fromage, sans doute. »
Le Corbeau, honteux et confus,
Jura, mais un peu tard, qu'on ne l'y prendrait plus.`,
  },
  {
    title: "Mon premier dimanche à Paris",
    source: "Personal journal",
    type: "personal",
    content: `Aujourd'hui, je me suis promenée dans le Marais. Le quartier était calme, presque silencieux pour un dimanche matin. J'ai pris un café au coin d'une petite rue et j'ai écouté les conversations autour de moi. Je n'ai pas tout compris, mais j'ai aimé le rythme de la langue.

L'après-midi, je suis allée au musée Carnavalet. C'est gratuit, et il y a beaucoup de choses sur l'histoire de Paris. J'ai pensé à ma grand-mère qui rêvait de venir ici. Demain, je veux essayer de commander mon déjeuner uniquement en français. C'est un petit défi, mais je crois que je suis prête.`,
  },
  {
    title: "L'intelligence artificielle change-t-elle nos métiers ?",
    source: "Sundew (sample)",
    type: "news",
    content: `Depuis l'arrivée des grands modèles de langage, le débat sur l'avenir du travail a pris une nouvelle ampleur. Selon une étude récente publiée par l'OCDE, près d'un emploi sur quatre dans les pays développés pourrait être profondément transformé par l'intelligence artificielle dans les dix prochaines années.

Mais cette transformation ne signifie pas nécessairement disparition. Beaucoup d'experts soulignent que les outils d'IA fonctionnent mieux comme assistants que comme remplaçants. « Nous voyons émerger de nouveaux métiers hybrides, où la créativité humaine est augmentée par la puissance de calcul des machines », explique une chercheuse de l'INRIA.

Reste la question des inégalités. Si les bénéfices de cette révolution se concentrent dans quelques entreprises, le risque social pourrait devenir considérable. Les gouvernements européens commencent à réfléchir à des cadres de régulation, mais le chemin est encore long.`,
  },
];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const existing = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, LEGACY_OWNER_ID), eq(documents.title, seed.title)))
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(documents).values({
      ...seed,
      id: randomUUID(),
      userId: LEGACY_OWNER_ID,
      wordCount: countWords(seed.content),
      estimatedLevel: naiveLevelEstimate(seed.content),
    });
    inserted += 1;
  }

  console.log(`✓ Seed complete — inserted ${inserted}, skipped ${skipped}.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

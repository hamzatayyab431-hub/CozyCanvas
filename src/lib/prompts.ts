/** Represents a themed collection of drawing prompts shown in the game lobby. */
export interface PromptCategory {
  /** Unique slug used to look up this category (e.g. 'animals', 'fantasy_adventure'). */
  id: string;
  /** Display name shown in the category picker, including an emoji prefix. */
  name: string;
  /** Short flavour text describing the category's theme. */
  description: string;
  /** Array of prompt strings that the game randomly selects from during a round. */
  prompts: string[];
}

/**
 * All available prompt categories shipped with the game.
 * Import this array to populate category pickers or to iterate over all prompts.
 */
export const promptCategories: PromptCategory[] = [
  {
    id: 'animals',
    name: '🐱 Cute & Wild Animals',
    description: 'Furry, feathery, and scaly creatures doing unusual things.',
    prompts: [
      'A hipster cat drinking a pumpkin spice latte',
      'A detective squirrel inspecting an acorn with a magnifying glass',
      'A fluffy penguin wearing a warm winter scarf and earmuffs',
      'An astronaut golden retriever floating in space catching tennis balls',
      'A sleepy sloth hanging from a branch wearing a tiny nightcap',
      'A fancy octopus wearing a top hat and playing the drums',
      'A capybara soaking in a hot tub filled with lemon slices',
      'A tiny chameleon trying to blend in with a box of colorful donuts',
      'An elegant giraffe wearing a very long striped scarf',
      'A chubby hedgehog having a picnic with a strawberry'
    ]
  },
  {
    id: 'objects',
    name: '🎨 Everyday & Magical Objects',
    description: 'Ordinary items with a fun, magical, or cozy twist.',
    prompts: [
      'A cozy cottage shaped like a giant teapot with smoke coming from the spout',
      'A magical treasure chest overflowing with glowing star-shaped candy',
      'A pair of flying roller skates with angelic wings',
      'A vintage typewriter with letters floating up like bubbles',
      'An old grandfather clock that has a tiny secret garden inside',
      'A retro game console that is growing colorful pixelated mushrooms',
      'A warm mug of hot chocolate with marshmallow snowman friends bathing in it',
      'A camera that prints out tiny, glowing paper planes instead of photos',
      'A backpack overflowing with maps, compasses, and adventure gear',
      'A stack of spell books with a tiny glowing candle on top'
    ]
  },
  {
    id: 'relationship',
    name: '💞 Draw Your Partner As...',
    description: 'Funny and heartwarming representations of your playing partner.',
    prompts: [
      'Draw your partner as a majestic fantasy creature (unicorn, dragon, etc.)',
      'Draw your partner as a sleepy, grumpy morning owl',
      'Draw your partner as a medieval knight with a funny cardboard shield',
      'Draw your partner as a cute, squishy potato wearing their favorite outfit',
      'Draw your partner as a famous superhero who is very bad at their job',
      'Draw your partner as a royal king or queen sitting on a throne of snacks',
      'Draw your partner as a wizard casting a spell to avoid doing chores',
      'Draw your partner as a legendary rockstar playing a flaming guitar',
      'Draw your partner as a sweet cuddly teddy bear wearing cozy slippers',
      'Draw your partner as an alien tourist visiting Earth for the first time'
    ]
  },
  {
    id: 'fantasy_adventure',
    name: '🧙 Fantasy & Adventure',
    description: 'Dragons, knights, and magical worlds straight out of a storybook.',
    prompts: [
      'A tiny dragon learning to breathe fire for the first time',
      'A wizard who accidentally turned their wand into a rubber chicken',
      'A mermaid discovering a shipwreck full of vintage board games',
      'A knight in shining armor trying to defeat a dragon at a game of chess',
      'An enchanted forest where the trees have friendly glowing eyes at night',
      'A fairy godmother exhausted and asleep on a pile of ungranted wishes',
      'A pirate ship sailing through a sea of fluffy pink clouds',
      'A magical library where the books can fly around and talk to each other',
      'A dwarf blacksmith forging a tiny magical sword for a field mouse',
      'A phoenix rising from the ashes holding a cup of morning coffee'
    ]
  },
  {
    id: 'silly_absurd',
    name: '🤪 Silly & Absurd',
    description: 'Wacky, weird, and surreal scenarios that make absolutely no sense.',
    prompts: [
      'A giant pizza slice surfing on a wave of bubbly soda',
      'A cloud having a temper tantrum and throwing down rubber ducks',
      'A dinosaur trying to paint a miniature painting with a tiny brush',
      'A banana slipping on a human peel',
      'A slice of toast jumping out of a toaster with a parachute',
      'A friendly ghost who is terribly afraid of the dark holding a flashlight',
      'A hot air balloon that is actually a giant floating strawberry',
      'A vacuum cleaner trying to eat a galaxy of stars',
      'A grumpy broccoli wearing a leather jacket and sunglasses',
      'A sandwich trying to run away from a plate using toothpick legs'
    ]
  }
];

/**
 * Returns a randomly selected prompt from the given category.
 *
 * @param categoryId - Optional category `id` to draw from. Pass `'all'` or omit to
 *   pick from any category at random. If the supplied id is not found, falls back
 *   to a random category.
 * @returns An object with the selected `prompt` string and the `categoryName` it
 *   came from (useful for displaying a label alongside the prompt).
 */
export function getRandomPrompt(categoryId?: string): { prompt: string; categoryName: string } {
  let targetCategory: PromptCategory;

  if (categoryId && categoryId !== 'all') {
    const found = promptCategories.find(c => c.id === categoryId);
    if (found) {
      targetCategory = found;
    } else {
      targetCategory = promptCategories[Math.floor(Math.random() * promptCategories.length)];
    }
  } else {
    targetCategory = promptCategories[Math.floor(Math.random() * promptCategories.length)];
  }

  const prompt = targetCategory.prompts[Math.floor(Math.random() * targetCategory.prompts.length)];
  return { prompt, categoryName: targetCategory.name };
}

export interface PromptCategory {
  id: string;
  name: string;
  description: string;
  prompts: string[];
}

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

// The vibe vocabulary - parsed from the hand-written colour/emotion cipher.
// THIS is the one place hue carries meaning (spec section 4): each arc stores a
// `vibe_id` (stable identity) whose `hex` comes from this DB. The palette
// therefore doubles as the tag vocabulary for search (sections 6/12).
//
// vibe_id is currently the hex without the # (unique across all entries); it
// can migrate to an opaque id later without touching the UI.
//
// Emotion text is kept verbatim - it is the user's own synesthetic vocabulary.

export interface Vibe {
  id: string;
  hex: string;
  emotion: string;
}

export const VIBES: Vibe[] = [
  { id: 'a709ca', hex: '#a709ca', emotion: 'doing necessary self care tasks that aren\'t fun, but are necessary to enjoyment later' },
  { id: '6905e0', hex: '#6905e0', emotion: 'doing necessary tasks that are boring, low engagement, possible resentment' },
  { id: '05e0b8', hex: '#05e0b8', emotion: 'doing small, low stress but boring health related tasks like meal prep etc' },
  { id: '24b3e0', hex: '#24b3e0', emotion: 'childcare with a bonding component' },
  { id: 'f97a80', hex: '#f97a80', emotion: 'self care that is relaxing and physically pleasant eg a bath' },
  { id: 'f7be42', hex: '#f7be42', emotion: 'small but necessary paperwork or admin task, but it\'s frustrating or unclear for some petty, irritating reason' },
  { id: '42e5ba', hex: '#42e5ba', emotion: 'reading or learning things to help with healthy habits or behaviours' },
  { id: '8f88fc', hex: '#8f88fc', emotion: 'I\'m doing dishes, but I\'m not mad about it' },
  { id: 'a24df0', hex: '#a24df0', emotion: 'laundry, small, light, possibly handwashing' },
  { id: 'ffda8a', hex: '#ffda8a', emotion: 'soft, enjoyable, affirming, gentle organisation or information sorting' },
  { id: '138d67', hex: '#138d67', emotion: 'doing a workout but it\'s not that pleasant for some reason, not difficult, just not really aligned' },
  { id: 'de3e3e', hex: '#de3e3e', emotion: 'intense passion, physical desire, fire' },
  { id: '6deef2', hex: '#6deef2', emotion: 'childcare, physical tasks like going for a walk with Bug etc, pleasant' },
  { id: '422c1e', hex: '#422c1e', emotion: 'jealousy, competitiveness, malice tinged, unhealthy, directed towards other' },
  { id: 'f2a1d8', hex: '#f2a1d8', emotion: 'beauty routine stuff, boring, feels like work, not the fun bits' },
  { id: 'bebebe', hex: '#bebebe', emotion: 'sad, empty, downcast, unwanted' },
  { id: '3a0066', hex: '#3a0066', emotion: 'cleaning up something that brings up trauma' },
  { id: 'fc844f', hex: '#fc844f', emotion: 'travelling to another location, low stress, in order to do something calm or nice for myself' },
  { id: 'ffb3b3', hex: '#ffb3b3', emotion: 'affectionate, soft, sweet, caring, gently adoring' },
  { id: '17594a', hex: '#17594a', emotion: 'getting workout gear together, organising the workout space, physio exercises' },
  { id: 'e8e0d4', hex: '#e8e0d4', emotion: 'fragile self esteem' },
  { id: '6666aa', hex: '#6666aa', emotion: 'sad, down, melancholic' },
  { id: 'ffd1dc', hex: '#ffd1dc', emotion: 'flush of platonic affection, happiness associated with a friend, sweet, safe' },
  { id: 'b0ffad', hex: '#b0ffad', emotion: 'making plans to get healthy food, meal planning, optimistic' },
  { id: '241f20', hex: '#241f20', emotion: 'betrayal linked hatred' },
  { id: '72a2bf', hex: '#72a2bf', emotion: 'creeping dread or regret around parenting choices' },
  { id: 'ffeeaa', hex: '#ffeeaa', emotion: 'books, folders, documents, paper, handling them, neutral about it' },
  { id: 'bcd4c3', hex: '#bcd4c3', emotion: 'not wanting to make healthy choices but doing it anyway' },
  { id: 'aa36e3', hex: '#aa36e3', emotion: 'choosing or interacting with scented things - not intellectual or sensual, just daily use of everyday items' },
  { id: 'c29786', hex: '#c29786', emotion: 'going to work, not looking forward to it, not dramatic or anything though, just meh' },
  { id: '3767d6', hex: '#3767d6', emotion: 'filling in school forms, meeting with teachers etc' },
  { id: 'd61029', hex: '#d61029', emotion: 'affection tinged desire, romantic love, physically embodied' },
  { id: 'fff86c', hex: '#fff86c', emotion: 'idk but I scrunched my face up at it, something about offices?' },
  { id: 'ff9200', hex: '#ff9200', emotion: 'in a waiting room or similar space on the way to complete a task, away from home, low stress but maybe impatient' },
  { id: '1d1d1b', hex: '#1d1d1b', emotion: 'idk, made a frowny face - something ew? Disgusting? But like, not distressing, I guess like having to clean up a dead mouse that smells a little bit or something, but it’s nbd' },
  { id: '20c96d', hex: '#20c96d', emotion: 'cooking food, healthy stuff, no junk' },
  { id: 'f9b7c4', hex: '#f9b7c4', emotion: 'affection towards animals' },
  { id: 'ffb86b', hex: '#ffb86b', emotion: 'brushing my teeth' },
  { id: '3c3238', hex: '#3c3238', emotion: 'rejected, undesirable, unwanted' },
  { id: '95e8a9', hex: '#95e8a9', emotion: 'healthy food stuff, there’s not much fine grained detail in these types of greens' },
  { id: 'a37cb0', hex: '#a37cb0', emotion: 'cleaning up a minor mess resentful, like, someone else’s dirty socks on the floor' },
  { id: '9bd3f5', hex: '#9bd3f5', emotion: 'sad, hoping nothing ever happens to Bug' },
  { id: 'e00000', hex: '#e00000', emotion: 'anger with energy or action behind it, directed towards something, hot, immediate, physically embodied' },
  { id: '60412c', hex: '#60412c', emotion: 'resentful dislike, I don\'t want this person in my space, has a contemptuous quality' },
  { id: 'f5ed65', hex: '#f5ed65', emotion: 'being made to fill in forms or organise appointments but there’s something bad, urgent about it, like it’s an emergency because something terrible has happened' },
  { id: '3d3c6b', hex: '#3d3c6b', emotion: 'heavy sadness, resignation, stagnation, depression' },
  { id: 'b19fe2', hex: '#b19fe2', emotion: 'putting away or preparing to wash clothes that are brand new, not exciting though, like, socks or something' },
  { id: 'a15c32', hex: '#a15c32', emotion: 'having to attend an event that brings up negative feelings, social discord present, resentment, anger, contempt towards situation or others present' },
  { id: 'c9e4e7', hex: '#c9e4e7', emotion: 'handling Bug’s baby clothes or outgrown toys' },
  { id: '121212', hex: '#121212', emotion: 'extremely depressed, broken hearted' },
  { id: '85edc7', hex: '#85edc7', emotion: 'teaching Bug to cook' },
  { id: 'cc80ff', hex: '#cc80ff', emotion: 'washing or caring for delicate clothing items for myself, like underwear or something' },
  { id: '76a85d', hex: '#76a85d', emotion: 'pleasant physical activity, but it’s cold' },
  { id: 'fca672', hex: '#fca672', emotion: 'ew. Idk why tho' },
  { id: 'bfbfbf', hex: '#bfbfbf', emotion: 'tired, withdrawn' },
  { id: '61336b', hex: '#61336b', emotion: 'dealing with an object that has been ruined or damaged, not angry though' },
  { id: '5e463a', hex: '#5e463a', emotion: 'choosing clothing/dressing while being competitive and unkind' },
  { id: 'fff27c', hex: '#fff27c', emotion: 'neutral, pleasant' },
  { id: 'f7c2cf', hex: '#f7c2cf', emotion: 'soft affection' },
  { id: '3a6eb9', hex: '#3a6eb9', emotion: 'parenting task with friction or annoyance' },
  { id: 'ff3434', hex: '#ff3434', emotion: 'desire directed towards another, urge to touch another, hungry, anticipatory' },
  { id: 'fcfcf7', hex: '#fcfcf7', emotion: 'calm yet hopeful' },
  { id: 'b2c3ff', hex: '#b2c3ff', emotion: 'lazy, napping with Bug nearby' },
  { id: 'f5f2f1', hex: '#f5f2f1', emotion: 'opening a package, or parcel - nothing big or exciting though' },
  { id: 'ec6601', hex: '#ec6601', emotion: 'annoyed, having to rush' },
  { id: '0b4d91', hex: '#0b4d91', emotion: 'negative, murky, relationship issues that aren’t clear cut, hard to understand' },
  { id: 'd4cf6c', hex: '#d4cf6c', emotion: 'decay, putrid, disgusting' },
  { id: 'f4f6eb', hex: '#f4f6eb', emotion: 'softest willing entrained surrender - emptiness pulling, begging to be filled' },
  { id: '373832', hex: '#373832', emotion: 'duty without drama, stoic, doing what needs to be done no matter how I feel about it' },
  { id: 'cc6a72', hex: '#cc6a72', emotion: 'outward flirtation, sprung from desire, vulnerable, soft , sweet' },
  { id: 'b84c2e', hex: '#b84c2e', emotion: 'deliberate, outward flirtation, slightly performative, trying to catch or entice, not gentle' },
  { id: '613124', hex: '#613124', emotion: 'competitive, display, “you won’t outshine me”' },
  { id: 'c98a1c', hex: '#c98a1c', emotion: 'radiant, magnetic, glowing pleasure, energetic' },
  { id: '10061f', hex: '#10061f', emotion: 'forbidden love, bound, longing but controlled' },
  { id: '140306', hex: '#140306', emotion: 'forbidden desire, indulged anyway' },
  { id: '904955', hex: '#904955', emotion: 'Soft‑bound yearning – discreet allure' },
  { id: 'ffd2c4', hex: '#ffd2c4', emotion: 'friendly support, gentle encouragement, warm companionship' },
];

export const VIBES_BY_ID: Record<string, Vibe> = Object.fromEntries(
  VIBES.map((v) => [v.id, v]),
);

// Deliberate dummy data. Replace these titles and sample poster mappings later.
export const collections = {
  all: { title: "All movies", label: "Every mood. Every language." },
  favourites: {
    title: "My Favourite Movies",
    label: "Your favourites",
    seeds: ["Bommarillu", "Love Failure", "Ala Modalaindi", "Neerajanam"],
  },
  telugu: {
    title: "Telugu movies",
    label: "Tollywood",
    language: "Telugu",
    seeds: ["Bommarillu", "Love Failure", "Ala Modalaindi"],
  },
  hindi: {
    title: "Hindi movies",
    label: "Bollywood",
    language: "Hindi",
    seeds: ["3 Idiots", "Dangal", "Zindagi Na Milegi Dobara"],
  },
  tamil: {
    title: "Tamil movies",
    label: "Kollywood",
    language: "Tamil",
    seeds: ["96", "Vikram", "Kaithi"],
  },
  malayalam: {
    title: "Malayalam movies",
    label: "Mollywood",
    language: "Malayalam",
    seeds: ["Premam", "Bangalore Days", "Manjummel Boys"],
  },
  english: {
    title: "English movies",
    label: "Hollywood",
    language: "English",
    seeds: ["Interstellar", "Inception", "The Dark Knight"],
  },
  romance: {
    title: "Romance movies",
    label: "A little love",
    genre: "Romance",
  },
  drama: { title: "Drama movies", label: "Stories that stay", genre: "Drama" },
  comedy: { title: "Comedy movies", label: "Keep it light", genre: "Comedy" },
  thriller: {
    title: "Thriller movies",
    label: "One more twist",
    genre: "Thriller",
  },
  action: {
    title: "Action movies",
    label: "Turn up the energy",
    genre: "Action",
  },
  scifi: {
    title: "Sci-Fi movies",
    label: "Beyond the ordinary",
    genre: "Sci-Fi",
  },
};

const posters = [
  {
    key: "bommarillu",
    file: "709356baa588c022e0f30266d1fbd6c1.webp",
    width: 424,
    height: 600,
  },
  { key: "love-failure", file: "wp6908042.webp", width: 860, height: 405 },
  { key: "ala-modalaindi", file: "wp7374638.webp", width: 860, height: 1219 },
  { key: "neerajanam", file: "wp6907956.webp", width: 860, height: 430 },
];

const sampleTitles = [
  "After the Rain",
  "Midnight Journey",
  "Letters from Home",
  "A Quiet Summer",
  "The Last Train",
  "City of Lanterns",
  "Beyond the River",
  "The Long Way Back",
  "Paper Planes",
  "Under the Same Sky",
  "Yesterday Again",
  "The Hidden Road",
  "A Thousand Miles",
  "Weekend Stories",
  "Before the Dawn",
  "A Place to Begin",
  "The Other Side",
  "Distant Lights",
  "One More Sunrise",
  "The Blue Hour",
  "Borrowed Time",
  "The Smallest Things",
  "Parallel Lives",
  "A Familiar Voice",
  "The Open Door",
  "Days Like These",
  "The Silver Coast",
  "Somewhere Close",
  "A Little Courage",
  "The Final Letter",
  "Wildflower Season",
  "The Night Market",
  "Ocean of Dreams",
  "Unwritten Chapters",
  "Lost and Found",
  "The First Goodbye",
  "When We Return",
  "Chasing Tomorrow",
  "The Last Photograph",
  "A New Beginning",
];
const languages = ["Telugu", "Hindi", "Tamil", "Malayalam", "English"];
const genres = ["Romance", "Drama", "Comedy", "Thriller", "Action", "Sci-Fi"];

const sampleStories = [
  "An unexpected meeting brings two people together just as their lives are moving in different directions. As friendship turns into something deeper, they must decide whether to follow the plans others have made for them or take a chance on a future of their own.",
  "Returning home after years away, a young dreamer finds a family divided by old misunderstandings. A forgotten letter becomes the start of a journey through familiar streets, difficult conversations and second chances, revealing that moving forward sometimes means looking back.",
  "Three friends set out on a weekend trip with very different hopes. A missed train and a series of unlikely encounters turn their carefully planned escape into an adventure, testing their friendship and helping each of them discover what really matters.",
  "A quiet town is unsettled by a message with no sender. Following a trail of small clues, an unlikely pair uncover a secret that connects their pasts. Every answer brings a harder choice, and the truth may change the place they call home.",
  "When a promise pulls an ordinary person into an extraordinary journey, a reluctant team must learn to trust one another. Across unfamiliar places and unexpected challenges, they discover that courage is less about being fearless and more about showing up for the people who need you.",
  "A mysterious signal arrives from beyond the familiar world. A curious explorer follows it toward an impossible discovery, only to learn that the greatest question is not what lies out there, but what they are willing to leave behind and what is worth bringing home.",
];

export function getMovieStory(title) {
  const seed = [...title].reduce(
    (total, character) => total + character.codePointAt(0),
    0,
  );
  return sampleStories[seed % sampleStories.length];
}

export function getCollection(requestedKey) {
  const key = Object.hasOwn(collections, requestedKey) ? requestedKey : "all";
  const collection = collections[key];
  const movies = sampleTitles.map((title, index) => ({
    id: `${key}-${index + 1}`,
    title: collection.seeds?.[index] ?? title,
    story: getMovieStory(collection.seeds?.[index] ?? title),
    language: collection.language ?? languages[index % languages.length],
    genre: collection.genre ?? genres[index % genres.length],
    year: 1995 + ((index * 7) % 30),
    poster: posters[index % posters.length],
  }));
  return { key, ...collection, movies };
}

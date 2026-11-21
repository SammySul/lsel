export interface Project {
  name: string;
  what: string;
  url: string;
}

export const projects: readonly Project[] = [
  {
    name: "typ",
    what: "Compare fonts side by side on your own text, in your browser",
    url: "https://typ.sammysul.com",
  },
  {
    name: "yank-wars",
    what: "Vim golf: match the target in the fewest keystrokes",
    url: "https://yankwars.app",
  },
  {
    name: "lsel-station",
    what: "An idle game about running a salvage station on the frontier",
    url: "https://lsel-station.sammysul.com",
  },
  {
    name: "dajaj",
    what: "PUBG stats for the matches a group of friends played together",
    url: "https://dajaj.sammysul.com",
  },
  {
    name: "lsel",
    what: "The source of all of them, and the kit they share",
    url: "https://git.sammysul.com/SammySul/lsel",
  },
];

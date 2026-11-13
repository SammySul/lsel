import type { OracleSettings } from "../types.ts";

export interface Snippet {
  lang: "js" | "ts" | "py" | "go" | "rs" | "css" | "json" | "text";
  /** printable ASCII and tab; Go indents with tabs */
  text: string;
}

export const SETTINGS: Readonly<Record<Snippet["lang"], OracleSettings>> = {
  js: { tabSize: 2, indentUnit: "  " },
  ts: { tabSize: 2, indentUnit: "  " },
  py: { tabSize: 4, indentUnit: "    " },
  go: { tabSize: 4, indentUnit: "\t" },
  rs: { tabSize: 4, indentUnit: "    " },
  css: { tabSize: 2, indentUnit: "  " },
  json: { tabSize: 2, indentUnit: "  " },
  text: { tabSize: 8, indentUnit: "  " },
};

// Original snippets in the shape golf puzzles take: short lines, brackets, quotes, numbers, repetition.
export const SNIPPETS: readonly Snippet[] = [
  {
    lang: "js",
    text: `const items = [1, 2, 3, 4];
const doubled = items.map((x) => x * 2);
const total = doubled.reduce((a, b) => a + b, 0);
console.log("total:", total);`,
  },
  {
    lang: "js",
    text: `function greet(name, greeting = "Hello") {
  if (!name) {
    return greeting + ", stranger!";
  }
  return greeting + ", " + name + "!";
}

module.exports = { greet };`,
  },
  {
    lang: "js",
    text: `export default {
  name: 'button',
  props: ['label', 'kind', 'size'],
  data() {
    return { pressed: false, count: 0 };
  },
  methods: {
    click() { this.count++; this.pressed = true; },
  },
};`,
  },
  {
    lang: "js",
    text: `var a = 1;
var b = 2;
var c = 3;
var d = a + b + c;
if (d == 6) alert('six');`,
  },
  {
    lang: "js",
    text: `for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (row.id === undefined) continue;
  out.push({ id: row.id, name: row.name.trim() });
}`,
  },
  {
    lang: "ts",
    text: `interface User {
  id: number;
  name: string;
  email?: string;
  roles: string[];
}

type Role = "admin" | "editor" | "viewer";`,
  },
  {
    lang: "ts",
    text: `export async function load(url: string): Promise<Data> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return (await res.json()) as Data;
}`,
  },
  {
    lang: "ts",
    text: `enum Color {
  Red = "RED",
  Green = "GREEN",
  Blue = "BLUE",
}
const all: Color[] = [Color.Red, Color.Green, Color.Blue];`,
  },
  {
    lang: "ts",
    text: `class Stack<T> {
  private items: T[] = [];
  push(item: T): void { this.items.push(item); }
  pop(): T | undefined { return this.items.pop(); }
  get size(): number { return this.items.length; }
}`,
  },
  {
    lang: "py",
    text: `def fizzbuzz(n):
    for i in range(1, n + 1):
        if i % 15 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)`,
  },
  {
    lang: "py",
    text: `import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DEBUG = os.environ.get('DEBUG', '0') == '1'`,
  },
  {
    lang: "py",
    text: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point({self.x}, {self.y})"`,
  },
  {
    lang: "py",
    text: `scores = {"alice": 90, "bob": 72, "carol": 85}
best = max(scores, key=scores.get)
names = [n.title() for n in sorted(scores)]
print(best, names)`,
  },
  {
    lang: "go",
    text: `package main

import "fmt"

func main() {
	nums := []int{3, 1, 4, 1, 5}
	sum := 0
	for _, n := range nums {
		sum += n
	}
	fmt.Println("sum", sum)
}`,
  },
  {
    lang: "go",
    text: `type Server struct {
	Addr    string
	Port    int
	Verbose bool
}

func (s *Server) URL() string {
	return fmt.Sprintf("http://%s:%d", s.Addr, s.Port)
}`,
  },
  {
    lang: "go",
    text: `if err != nil {
	return nil, err
}
data, err := os.ReadFile(path)
if err != nil {
	return nil, fmt.Errorf("read %s: %w", path, err)
}`,
  },
  {
    lang: "rs",
    text: `fn main() {
    let v = vec![1, 2, 3];
    let s: i32 = v.iter().map(|x| x * x).sum();
    println!("{}", s);
}`,
  },
  {
    lang: "rs",
    text: `#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Num(f64),
    Plus,
    Minus,
    LParen,
    RParen,
}`,
  },
  {
    lang: "rs",
    text: `impl Config {
    pub fn new(args: &[String]) -> Result<Config, &str> {
        if args.len() < 3 {
            return Err("not enough arguments");
        }
        Ok(Config { query: args[1].clone(), file: args[2].clone() })
    }
}`,
  },
  {
    lang: "css",
    text: `.card {
  display: flex;
  padding: 8px 16px;
  margin: 0 auto;
  color: #333;
  border-radius: 4px;
}`,
  },
  {
    lang: "css",
    text: `h1, h2, h3 { font-weight: bold; }
a:hover { text-decoration: underline; }
.btn-primary { background: blue; color: white; }
.btn-danger { background: red; color: white; }`,
  },
  {
    lang: "json",
    text: `{
  "name": "demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "test": "bun test"
  },
  "keywords": ["vim", "golf"]
}`,
  },
  {
    lang: "json",
    text: `[
  {"id": 1, "tag": "red"},
  {"id": 2, "tag": "green"},
  {"id": 3, "tag": "blue"}
]`,
  },
  {
    lang: "text",
    text: `apple
banana
cherry
date
elderberry
fig
grape`,
  },
  {
    lang: "text",
    text: `one two three
four five six
seven eight nine
ten eleven twelve`,
  },
  {
    lang: "text",
    text: `TODO: fix the parser
TODO: add tests
DONE: write docs
TODO: release v2`,
  },
  {
    lang: "text",
    text: `name,age,city
Ann,31,Oslo
Bo,27,Lund
Cy,45,Kiel`,
  },
  {
    lang: "text",
    text: `  - item one
  - item two
    - nested a
    - nested b
  - item three`,
  },
  {
    lang: "text",
    text: `x = 10
y = 20
z = x + y
print z`,
  },
  {
    lang: "text",
    text: `The quick brown fox jumps over the lazy dog.
Pack my box with five dozen liquor jugs.

How vexingly quick daft zebras jump!`,
  },
];

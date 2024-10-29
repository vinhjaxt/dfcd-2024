import { say } from "https://deno.land/x/cowsay/mod.ts";

const cows = [
  "atom",
  "bearface",
  "biohazard",
  "box",
  "cat",
  "cat2",
  "coffee",
  "cube",
  "cow",
  "fox",
  "hand",
  "kitten",
  "mule",
  "world",
  "yasuna",
]

const cow = cows[Math.round(Math.random() * (cows.length - 1))]
console.log(cow, 'says:')

process.stdout.write(say({
  text: Deno.args[0],
  cow
  // random: true
}))

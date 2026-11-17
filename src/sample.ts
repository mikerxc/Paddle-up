import type { Player } from "./model.ts";

/** A full social-group roster so a new phone can try a night without typing 12 names. */
export const samplePlayers: Player[] = [
  { id: "sample-maya", name: "Maya Chen", gender: "female", skill: 3.8, createdAt: 1 },
  { id: "sample-andre", name: "Andre Walsh", gender: "male", skill: 4.2, createdAt: 2 },
  { id: "sample-priya", name: "Priya Shah", gender: "female", skill: 3.2, createdAt: 3 },
  { id: "sample-luis", name: "Luis Ortega", gender: "male", skill: 3.6, createdAt: 4 },
  { id: "sample-hannah", name: "Hannah Brooks", gender: "female", skill: 4.6, createdAt: 5 },
  { id: "sample-chris", name: "Chris Dalton", gender: "male", skill: 2.8, createdAt: 6 },
  { id: "sample-nina", name: "Nina Patel", gender: "female", skill: 4.1, createdAt: 7 },
  { id: "sample-owen", name: "Owen Blake", gender: "male", skill: 4.4, createdAt: 8 },
  { id: "sample-sara", name: "Sara Kim", gender: "female", skill: 3.5, createdAt: 9 },
  { id: "sample-ben", name: "Ben Alvarez", gender: "male", skill: 3.9, createdAt: 10 },
  { id: "sample-grace", name: "Grace Nguyen", gender: "female", skill: 2.9, createdAt: 11 },
  { id: "sample-malik", name: "Malik Robinson", gender: "male", skill: 4.9, createdAt: 12 },
];

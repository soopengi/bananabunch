// Starting data for a brand-new circle.

/** Default points for each kind of contribution (admins can change these). */
export const weights = {
  picture: 2,
  description: 2,
  wishlist: 1,
  selected: 10,
  gift: 15,
  cake: 10,
};

export function newCircle() {
  return {
    people: [],
    wishlist: [],
    events: [],
    notifications: [],
    ledger: [],
    history: [],
    settings: {
      timezone: "Australia/Sydney",
      weights: { ...weights },
      emailEnabled: false,
    },
  };
}

import { router } from "../trpc";

// Reconciliation is done client-side since we already have ledger data.
// The recon page uses trpc.ledger.list to get system balances,
// then lets user paste/upload Tally data and does matching in the browser using fuse.js.
export const reconRouter = router({});

import { useGame } from '../../state/store.js';
import { WiringGraph } from '../wiring.js';

/**
 * "Show me" (hint level 3): performs the recommended step for the player when it is a plain action
 * (install a part, stack a part, fit/torque the next bolt, plug the missing avionics cable). Returns true if it did something.
 */
export async function performRecommendation(rec, ctx) {
  const g = useGame.getState();
  if (!rec) return false;
  switch (rec.reasonCode) {
    case 'assembly_order': {
      if (ctx.scope === 'CubeSat' || ctx.scope === 'Pad') { if (ctx.data.getPart(rec.objectRef)?.assembly === 'cubesat') return !!g.installPart(rec.objectRef); }
      const nxt = g.nextStackPart();
      if (nxt) return g.attachPart(nxt.part, nxt.lower, nxt.socket);
      return false;
    }
    case 'bolt_needed': {
      const st = g.jointState(rec.objectRef); const i = st.nextBolt(); if (i < 0) return false;
      const pass = st.currentPass();
      if (!st.present[i]) { g.boltAction(rec.objectRef, 'fit', i); return true; }
      g.boltAction(rec.objectRef, 'torque', i, st.passTargetNm(pass)); return true;
    }
    case 'avionics_wiring': {
      const link = ctx.rules.avionicsWiring.find((l) => l.from === rec.objectRef);
      return link ? g.addAvionicsCable(link.from, link.to) : false;
    }
    case 'wiring_needed': {
      // Plug the first missing required connection we can resolve: ask the validator which port needs a cable.
      const gr = new WiringGraph(ctx.rules); for (const [id, d] of ctx.wiring.devices) gr.addDevice(id, d);
      const need = rec.objectRef; if (!need || !need.includes('/')) return false;
      const { scan } = await import('./advisor.js'); void scan;
      const { whereDoesThisGo } = await import('./advisor.js');
      const t = whereDoesThisGo(need, ctx).find((x) => x.reasonCode === 'required_connection');
      return t ? g.addCable(need, t.objectRef, false) : false;
    }
    case 'safe_first': g.setArmed(false); return true;
    case 'rbf_pin': g.pullPin(true); return true;
    case 'safe_arm': g.setArmed(true); return true;
    default: return false;
  }
}

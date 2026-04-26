"use client";

import {
  authBlockOuter,
  ctaCreate,
  ctaJoin,
  gateCol,
  gateRowInner,
  rowChrome,
} from "../styles";

type GateModeProps = {
  onLogin: () => void;
  onSignup: () => void;
};

/**
 * Initial choice screen: two big gradient buttons (Log in / Sign up).
 * Sets the layout footprint that every other auth mode preserves.
 */
export function GateMode({ onLogin, onSignup }: GateModeProps) {
  return (
    <div className={authBlockOuter}>
      <div className={gateRowInner}>
        <div className={gateCol}>
          <div className={rowChrome}>
            <button type="button" className={ctaJoin} onClick={onLogin}>
              Log in
            </button>
          </div>
        </div>
        <div className={gateCol}>
          <div className={rowChrome}>
            <button type="button" className={ctaCreate} onClick={onSignup}>
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

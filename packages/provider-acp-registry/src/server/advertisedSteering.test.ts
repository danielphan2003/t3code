import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";

import { ADVERTISED_STEERING_META_KEY, advertisedSteering } from "./advertisedSteering.ts";

type InitializeResult = AcpSessionRuntime.AcpSessionRuntimeStartResult["initializeResult"];

const initializeWith = (meta: Record<string, unknown> | undefined) =>
  ({
    protocolVersion: 1,
    agentCapabilities: meta === undefined ? {} : { _meta: meta },
  }) as unknown as InitializeResult;

const runtimeAnswering = (answer: unknown) => {
  const requests: Array<{ method: string; params: unknown }> = [];
  const runtime = {
    request: (method: string, params: unknown) => {
      requests.push({ method, params });
      return Effect.succeed(answer);
    },
  } as unknown as AcpSessionRuntime.AcpSessionRuntime["Service"];
  return { runtime, requests };
};

describe("advertisedSteering", () => {
  it("is absent when the agent advertises nothing", () => {
    expect(advertisedSteering(initializeWith(undefined))).toBeUndefined();
    expect(advertisedSteering(initializeWith({ other: true }))).toBeUndefined();
  });

  it("ignores a method outside the extension namespace", () => {
    expect(
      advertisedSteering(
        initializeWith({ [ADVERTISED_STEERING_META_KEY]: { method: "session/prompt" } }),
      ),
    ).toBeUndefined();
  });

  it.effect("sends the steer to the advertised method", () =>
    Effect.gen(function* () {
      const steering = advertisedSteering(
        initializeWith({ [ADVERTISED_STEERING_META_KEY]: { method: "_autolith/steer" } }),
      );
      const { runtime, requests } = runtimeAnswering({
        outcome: "ok",
        value: { accepted: true, delivery: "steering" },
      });
      const steerId = yield* steering!.send(runtime, "session-1", "look at the tests too");
      expect(steerId).toBeUndefined();
      expect(requests).toEqual([
        {
          method: "_autolith/steer",
          params: { sessionId: "session-1", text: "look at the tests too" },
        },
      ]);
    }),
  );

  it.effect("accepts a result without an outcome", () =>
    Effect.gen(function* () {
      const steering = advertisedSteering(
        initializeWith({ [ADVERTISED_STEERING_META_KEY]: { method: "_vendor/steer" } }),
      );
      const { runtime } = runtimeAnswering({});
      expect(yield* steering!.send(runtime, "session-1", "go on")).toBeUndefined();
    }),
  );

  it.effect("fails when the agent declines the steer", () =>
    Effect.gen(function* () {
      const steering = advertisedSteering(
        initializeWith({ [ADVERTISED_STEERING_META_KEY]: { method: "_autolith/steer" } }),
      );
      const { runtime } = runtimeAnswering({ outcome: "unsupported", report: "closing" });
      const error = yield* Effect.flip(steering!.send(runtime, "session-1", "go on"));
      expect(error._tag).toBe("AcpRequestError");
    }),
  );
});

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as EffectAcpErrors from "effect-acp/errors";
import type * as AcpSessionRuntime from "@t3tools/provider-acp/server/AcpSessionRuntime";

/**
 * The `initialize` `agentCapabilities._meta` key an agent uses to name its steering method:
 * `{ "t3code/steering": { "method": "_vendor/steer" } }`. T3 then sends a steer as that request
 * with `{ sessionId, text }`, and the running turn keeps its tools. A result whose `outcome` is
 * missing or `"ok"` accepts the steer; any other result, or an error, declines it.
 */
export const ADVERTISED_STEERING_META_KEY = "t3code/steering";

const AdvertisedSteering = Schema.Struct({
  [ADVERTISED_STEERING_META_KEY]: Schema.Struct({
    method: Schema.String.check(Schema.isPattern(/^_/u)),
  }),
});
const decodeAdvertisedSteering = Schema.decodeUnknownOption(AdvertisedSteering);

const SteerResult = Schema.Struct({ outcome: Schema.optional(Schema.String) });
const decodeSteerResult = Schema.decodeUnknownOption(SteerResult);

export const advertisedSteering = (
  initializeResult: AcpSessionRuntime.AcpSessionRuntimeStartResult["initializeResult"],
) =>
  Option.match(decodeAdvertisedSteering(initializeResult.agentCapabilities?._meta), {
    onNone: () => undefined,
    onSome: (meta) => {
      const method = meta[ADVERTISED_STEERING_META_KEY].method;
      return {
        send: (
          runtime: AcpSessionRuntime.AcpSessionRuntime["Service"],
          sessionId: string,
          text: string,
        ) =>
          runtime.request(method, { sessionId, text }).pipe(
            Effect.flatMap((result) =>
              Option.exists(
                decodeSteerResult(result),
                (decoded) => decoded.outcome === undefined || decoded.outcome === "ok",
              )
                ? Effect.undefined
                : Effect.fail(
                    new EffectAcpErrors.AcpRequestError({
                      code: -32603,
                      errorMessage: "The agent did not accept the steering message.",
                      method,
                      data: result,
                    }),
                  ),
            ),
          ),
      };
    },
  });

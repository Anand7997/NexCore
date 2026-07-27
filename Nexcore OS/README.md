# NexCore OS

NexCore OS is an execution-intelligence operating system for designing, running, observing, diagnosing, and improving automated work across web, API, mobile, desktop, and data platforms.

It is not a general-purpose operating system and does not replace Windows or Linux. It is an application platform and control plane built on top of them.

## Product loop

```text
Define intent -> Compile workflow -> Schedule capabilities -> Execute anywhere
      ^                                                        |
      |                                                        v
Improve and reuse <- Repair or approve <- Diagnose <- Collect evidence
```

The detailed system design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Recommended implementation

- Keep `Nexus-Advanced` as the Next.js workspace UI.
- Keep `nexus-backend` as the initial NestJS control plane.
- Keep `nexus-api` as the Python execution and intelligence plane.
- Stabilize contracts before considering a control-plane rewrite.
- Add capabilities vertically, beginning with one excellent web-testing loop.

## First release definition

NexCore OS v1 is successful when a team can:

1. Define a business workflow once.
2. Execute it on a registered web runtime.
3. Watch every state transition in real time.
4. Inspect logs, screenshots, traces, and outputs from one timeline.
5. Receive an evidence-backed diagnosis.
6. Approve a repair and rerun only the affected path.


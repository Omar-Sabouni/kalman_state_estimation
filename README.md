# 2D Estimator Diagnostics

An interactive, client-side notebook for comparing Kalman, Alpha–Beta, and
Moving Average estimates of uncertain 2D motion. The trajectory, playback,
rolling error, innovation, covariance, gain, and estimator comparison all use
the same sample clock.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The application runs entirely in the
browser and does not send run data anywhere.

## What you can change

- Choose a smooth, noisy, maneuvering, or model-mismatch scenario.
- Adjust the simulated process and measurement noise.
- Change each estimator's assumptions and parameters.
- Play, pause, step, reset, or replay the trajectory.
- Switch between rolling error, innovation, covariance, gain, and whole-run
  comparison traces.
- Compare online and look-ahead correction schedules under a processing budget.

## Processing budget

Every sample includes a constant-velocity prediction. A scheduled Kalman action
then costs one credit for prediction, two for a single-axis correction, or
three for a full two-axis correction. For the default 80-sample run, budgets
therefore range from 80 to 240 credits.

The online schedule uses current innovation. The look-ahead schedule uses the
simulated path, so it is useful for comparison but is not an online policy.

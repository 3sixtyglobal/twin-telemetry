# Interface: ISystemMetricsProducerConstructorOptions

The options for the system metrics producer constructor.

## Properties

### telemetryComponentType? {#telemetrycomponenttype}

> `optional` **telemetryComponentType?**: `string`

Type name of the telemetry component in `ComponentFactory`.

#### Default

```ts
telemetry
```

***

### maxHistory? {#maxhistory}

> `optional` **maxHistory?**: `number`

Per-metric history cap.

#### Default

```ts
1440
```

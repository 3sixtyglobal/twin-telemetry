# Interface: ILastMetricValue

The in-memory state held for a metric so writes avoid reading storage.

## Properties

### ts {#ts}

> **ts**: `number`

The timestamp of the last computed value.

***

### value {#value}

> **value**: `number`

The last computed value.

***

### accessed {#accessed}

> **accessed**: `number`

The time the value was last written, used to expire metrics that have gone idle.

***

### historyIds? {#historyids}

> `optional` **historyIds?**: `string`[]

The retained value ids in ascending timestamp order, present once the history has been
tracked for a metric with a maxHistory cap small enough to hold in memory.

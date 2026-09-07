# Interface: IPendingTrim

The trim work accumulated for one metric while flushing a batch.

## Properties

### metricId {#metricid}

> **metricId**: `string`

The metric id whose history is being trimmed.

***

### maxHistory {#maxhistory}

> **maxHistory**: `number`

The maximum number of values to retain.

***

### addedIds {#addedids}

> **addedIds**: `string`[]

The ids written by this flush, in ascending timestamp order.

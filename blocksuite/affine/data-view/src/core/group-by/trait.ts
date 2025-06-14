import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import {
  computed,
  effect,
  type ReadonlySignal,
  signal,
} from '@preact/signals-core';

import type { GroupBy, GroupProperty } from '../common/types.js';
import type { TypeInstance } from '../logical/type.js';
import { createTraitKey } from '../traits/key.js';
import { computedLock } from '../utils/lock.js';
import type { Property } from '../view-manager/property.js';
import type { Row } from '../view-manager/row.js';
import type { SingleView } from '../view-manager/single-view.js';
import { compareDateKeys } from './compare-date-keys.js';
import { defaultGroupBy } from './default.js';
import { findGroupByConfigByName, getGroupByService } from './matcher.js';
import type { GroupByConfig } from './types.js';

/**
 * Metadata about a grouping: configuration, associated property, and type instance.
 */
export type GroupInfo<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = {
  config: GroupByConfig;
  property: Property<RawValue, JsonValue, Data>;
  tType: TypeInstance;
};

/**
 * Represents a single group with its key, value, rows, and configuration context.
 */
export class Group<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  rows: Row[] = [];

  constructor(
    public readonly key: string,
    public readonly value: JsonValue,
    private readonly groupInfo: GroupInfo<RawValue, JsonValue, Data>,
    public readonly manager: GroupTrait
  ) {}

  get property() {
    return this.groupInfo.property;
  }

  /** Computed display name for the group based on its value and type */
  name$ = computed(() => {
    const type = this.property.dataType$.value;
    return type ? this.groupInfo.config.groupName(type, this.value) : '';
  });

  /** Shortcut to the group configuration */
  private get config() {
    return this.groupInfo.config;
  }

  /** Underlying type instance for the grouped values */
  get tType() {
    return this.groupInfo.tType;
  }

  /** The view context associated with this grouping */
  get view() {
    return this.config.view;
  }

  hide$ = computed(
    () => this.manager.groupPropertiesMap$.value[this.key]?.hide ?? false
  );

  hideSet(hide: boolean) {
    this.manager.setGroupHide(this.key, hide);
  }
}

function hasGroupProperties(
  data: unknown
): data is { groupProperties?: GroupProperty[] } {
  return typeof data === 'object' && data !== null && 'groupProperties' in data;
}

/**
 * Trait that manages grouping behavior within a SingleView context.
 * Supports dynamic grouping, sorting, and row assignment.
 */
export class GroupTrait {
  /** Whether to hide groups with zero rows */
  hideEmpty$ = signal<boolean>(true);
  /** Sort order: true for ascending, false for descending */
  sortAsc$ = signal<boolean>(true);

  groupProperties$ = computed(() => {
    const data = this.view.data$.value;
    return hasGroupProperties(data) ? (data.groupProperties ?? []) : [];
  });

  groupPropertiesMap$ = computed(() => {
    const map: Record<string, GroupProperty> = {};
    this.groupProperties$.value.forEach(g => {
      map[g.key] = g;
    });
    return map;
  });

  /**
   * Synchronize sortAsc$ with the GroupBy sort descriptor
   */
  constructor(
    private readonly groupBy$: ReadonlySignal<GroupBy | undefined>,
    public readonly view: SingleView,
    private readonly ops: {
      groupBySet: (g: GroupBy | undefined) => void;
      sortGroup: (keys: string[], asc?: boolean) => string[];
      sortRow: (groupKey: string, rows: Row[]) => Row[];
      changeGroupSort: (keys: string[]) => void;
      changeRowSort: (
        groupKeys: string[],
        groupKey: string,
        keys: string[]
      ) => void;
      changeGroupHide?: (key: string, hide: boolean) => void;
    }
  ) {
    // Keep internal sortAsc flag in sync when GroupBy sort.desc changes
    effect(() => {
      const desc = this.groupBy$.value?.sort?.desc;
      if (desc != null && this.sortAsc$.value === desc) {
        this.sortAsc$.value = !desc;
      }
    });
  }

  /**
   * Compute current grouping metadata: configuration, property, and type.
   */
  groupInfo$ = computed<GroupInfo | undefined>(() => {
    const gb = this.groupBy$.value;
    if (!gb) return;

    const prop = this.view.propertyGetOrCreate(gb.columnId);
    if (!prop) return;

    const tType = prop.dataType$.value;
    if (!tType) return;

    const svc = getGroupByService(this.view.manager.dataSource);
    const config =
      gb.name != null
        ? (findGroupByConfigByName(this.view.manager.dataSource, gb.name) ??
          svc?.matcher.match(tType))
        : svc?.matcher.match(tType);

    if (!config) return;
    return { config, property: prop, tType };
  });

  /**
   * Build static group map from default keys defined in the configuration.
   */
  staticInfo$ = computed(() => {
    const info = this.groupInfo$.value;
    if (!info) return;
    const staticMap = Object.fromEntries(
      info.config
        .defaultKeys(info.tType)
        .map(({ key, value }) => [key, new Group(key, value, info, this)])
    );
    return { staticMap, groupInfo: info };
  });

  /**
   * Build dynamic map of groups for current rows, merging static defaults with actual data.
   */
  groupDataMap$ = computed(() => {
    const si = this.staticInfo$.value;
    if (!si) return;
    const { staticMap, groupInfo } = si;
    // Clone static defaults to start
    const map: Record<string, Group> = { ...staticMap };
    // Assign rows to their respective groups
    this.view.rows$.value.forEach(row => {
      const cell = this.view.cellGetOrCreate(row.rowId, groupInfo.property.id);
      const value = cell.jsonValue$.value;
      const buckets = groupInfo.config.valuesGroup(value, groupInfo.tType);
      buckets.forEach(({ key, value: v }) => {
        if (!map[key]) {
          map[key] = new Group(key, v, groupInfo, this);
        }
        map[key].rows.push(row);
      });
    });
    return map;
  });

  /**
   * Computed list of groups in sorted order, with optional hiding of empty groups.
   * Uses date-specific ordering when grouping by date.
   */
  groupsDataList$ = computedLock(
    computed(() => {
      const map = this.groupDataMap$.value;
      const info = this.groupInfo$.value;
      if (!map || !info) return;

      let orderedKeys: string[];
      // Use special date key sorting when applicable
      if (info.config.matchType.name === 'Date') {
        orderedKeys = Object.keys(map).sort(
          compareDateKeys(info.config.name, this.sortAsc$.value)
        );
      } else {
        orderedKeys = this.ops.sortGroup(Object.keys(map), this.sortAsc$.value);
      }

      // Filter out empty groups if requested
      return orderedKeys
        .map(key => map[key])
        .filter(
          g =>
            g != null &&
            !this.isGroupHidden(g.key) &&
            (!this.hideEmpty$.value || g.rows.length > 0)
        );
    }),
    this.view.isLocked$
  );

  /**
   * Computed list of groups including hidden ones, used by settings UI.
   */
  groupsDataListAll$ = computedLock(
    computed(() => {
      const map = this.groupDataMap$.value;
      const info = this.groupInfo$.value;
      if (!map || !info) return;

      let orderedKeys: string[];
      if (info.config.matchType.name === 'Date') {
        orderedKeys = Object.keys(map).sort(
          compareDateKeys(info.config.name, this.sortAsc$.value)
        );
      } else {
        orderedKeys = this.ops.sortGroup(Object.keys(map), this.sortAsc$.value);
      }

      const visible: Array<Group | undefined> = [];
      const hidden: Array<Group | undefined> = [];
      orderedKeys
        .map(key => map[key])
        .filter(g => g != null && (!this.hideEmpty$.value || g.rows.length > 0))
        .forEach(g => {
          if (g) {
            if (this.isGroupHidden(g.key)) {
              hidden.push(g);
            } else {
              visible.push(g);
            }
          }
        });
      return [...visible, ...hidden];
    }),
    this.view.isLocked$
  );

  /**
   * Toggle hiding of empty groups.
   */
  setHideEmpty(value: boolean) {
    this.hideEmpty$.value = value;
  }

  isGroupHidden(key: string): boolean {
    return this.groupPropertiesMap$.value[key]?.hide ?? false;
  }

  setGroupHide(key: string, hide: boolean) {
    this.ops.changeGroupHide?.(key, hide);
  }

  /**
   * Set sort order for date groupings and update GroupBy sort descriptor.
   */
  setDateSortOrder(asc: boolean) {
    this.sortAsc$.value = asc;
    const gb = this.groupBy$.value;
    if (gb) {
      this.ops.groupBySet({ ...gb, sort: { desc: !asc } });
    }
  }

  /** Shorthand for current grouping property */
  property$ = computed(() => this.groupInfo$.value?.property);

  /** Accessor for addGroup function in group configuration */
  get addGroup() {
    return this.property$.value?.meta$.value?.config.addGroup;
  }

  /**
   * Update the underlying data for the grouping property in all rows.
   */
  updateData = (data: NonNullable<unknown>) => {
    const prop = this.property$.value;
    if (!prop) return;
    this.view.propertyGetOrCreate(prop.id).dataUpdate(() => data);
  };

  /**
   * Add a single row to a specific group, updating its underlying value.
   */
  addToGroup(rowId: string, key: string) {
    const map = this.groupDataMap$.value;
    const info = this.groupInfo$.value;
    if (!map || !info) return;

    const addFn = info.config.addToGroup;
    if (addFn === false) return;

    const current = map[key]?.value;
    if (current != null) {
      const newVal = addFn(
        current,
        this.view.cellGetOrCreate(rowId, info.property.id).jsonValue$.value
      );
      this.view.cellGetOrCreate(rowId, info.property.id).valueSet(newVal);
    }
  }

  /**
   * Change grouping mode by name, preserving sort order.
   */
  changeGroupMode(modeName: string) {
    const propId = this.property$.value?.id;
    if (!propId) return;
    this.ops.groupBySet({
      type: 'groupBy',
      columnId: propId,
      name: modeName,
      sort: { desc: !this.sortAsc$.value },
    });
  }

  /**
   * Change the grouping column, initializing default grouping.
   */
  changeGroup(columnId: string | undefined) {
    if (columnId == null) {
      this.ops.groupBySet(undefined);
      return;
    }
    const column = this.view.propertyGetOrCreate(columnId);
    const meta = this.view.manager.dataSource.propertyMetaGet(
      column.type$.value
    );
    if (meta) {
      const gb = defaultGroupBy(
        this.view.manager.dataSource,
        meta,
        column.id,
        column.data$.value
      );
      if (gb) {
        gb.sort = { desc: !this.sortAsc$.value };
      }
      this.ops.groupBySet(gb);
    }
  }

  /**
   * Default grouping property settings for manual group manipulation.
   */
  defaultGroupProperty(key: string): GroupProperty {
    return {
      key,
      hide: false,
      manuallyCardSort: [],
    };
  }

  /**
   * Sort cards within a group by invoking row-sort operation.
   */
  changeCardSort(groupKey: string, cardIds: string[]) {
    const groups = this.groupsDataList$.value;
    if (!groups) return;
    this.ops.changeRowSort(
      groups.filter((g): g is Group => g !== undefined).map(g => g.key),
      groupKey,
      cardIds
    );
  }

  /**
   * Reorder groups globally.
   */
  changeGroupSort(keys: string[]) {
    this.ops.changeGroupSort(keys);
  }

  /**
   * Move a single card from one group to another at a specified position.
   */
  moveCardTo(
    rowId: string,
    fromGroupKey: string | undefined,
    toGroupKey: string,
    position: InsertToPosition
  ) {
    const map = this.groupDataMap$.value;
    const info = this.groupInfo$.value;
    if (!map || !info) return;

    // Handle value transfer between groups
    if (fromGroupKey !== toGroupKey) {
      const propId = this.property$.value?.id;
      if (!propId) return;

      const removeFn = info.config.removeFromGroup ?? (() => null);
      const sourceGroup = fromGroupKey ? map[fromGroupKey] : undefined;

      let newValue: unknown = null;
      if (sourceGroup) {
        newValue = removeFn(
          sourceGroup.value,
          this.view.cellGetOrCreate(rowId, propId).jsonValue$.value
        );
      }

      const addFn = info.config.addToGroup;
      if (!addFn) return;

      newValue = addFn(map[toGroupKey]?.value ?? null, newValue);
      this.view.cellGetOrCreate(rowId, propId).jsonValueSet(newValue);
    }

    // Reorder the row IDs within the target group
    const rows =
      map[toGroupKey]?.rows.filter(r => r.rowId !== rowId).map(r => r.rowId) ??
      [];
    const idx = insertPositionToIndex(position, rows, id => id);
    rows.splice(idx, 0, rowId);

    // Execute update of row order
    const groupKeys = Object.keys(map);
    this.ops.changeRowSort(groupKeys, toGroupKey, rows);
  }

  /**
   * Move an entire group to a new position in the group order.
   */
  moveGroupTo(groupKey: string, position: InsertToPosition) {
    const groups = this.groupsDataList$.value;
    if (!groups) return;

    const keys = groups
      .filter((g): g is Group => g !== undefined)
      .map(g => g.key);
    const fromIndex = keys.findIndex(k => k === groupKey);
    if (fromIndex >= 0) {
      keys.splice(fromIndex, 1);
      const idx = insertPositionToIndex(position, keys, k => k);
      keys.splice(idx, 0, groupKey);
      this.changeGroupSort(keys);
    }
  }

  /**
   * Remove a row from a group, updating underlying group value.
   */
  removeFromGroup(rowId: string, key: string) {
    const map = this.groupDataMap$.value;
    const info = this.groupInfo$.value;
    if (!map || !info) return;

    const propId = this.property$.value?.id;
    if (!propId) return;

    const removeFn = info.config.removeFromGroup ?? (() => undefined);
    const newValue = removeFn(
      map[key]?.value ?? null,
      this.view.cellGetOrCreate(rowId, propId).jsonValue$.value
    );
    this.view.cellGetOrCreate(rowId, propId).valueSet(newValue);
  }

  /**
   * Bulk-update the grouping value for multiple rows.
   */
  updateValue(rows: string[], value: unknown) {
    const propId = this.property$.value?.id;
    if (!propId) return;

    rows.forEach(rowId => {
      this.view.cellGetOrCreate(rowId, propId).jsonValueSet(value);
    });
  }
}

/** Trait key used to register and consume GroupTrait in the trait system */
export const groupTraitKey = createTraitKey<GroupTrait>('group');

/**
 * Sort an array by a manual ordering of IDs, preserving unspecified items at the end.
 */
export const sortByManually = <T>(
  arr: T[],
  getId: (v: T) => string,
  ids: string[]
) => {
  const map = new Map(arr.map(v => [getId(v), v]));
  const result: T[] = [];
  for (const id of ids) {
    const value = map.get(id);
    if (value) {
      map.delete(id);
      result.push(value);
    }
  }
  result.push(...map.values());
  return result;
};

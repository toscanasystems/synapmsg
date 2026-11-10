/**
 * Shared icon-name types.
 *
 * We derive them from `@expo/vector-icons` so that renaming a glyph
 * upstream surfaces a type-check error in our components.
 */

import { Feather } from '@expo/vector-icons';

export type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

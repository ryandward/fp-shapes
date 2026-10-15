// The fixtures' shell: an effects module that references every fixture's
// exports, so each is reached and only island.ts is an island. A fixture
// left out of this list is reported as an island by the run.

import { keep as any_parameter_keep } from '../any-parameter.js';
import { total as clean_arithmetic_total, label as clean_arithmetic_label, negated as clean_arithmetic_negated } from '../clean-arithmetic.js';
import { thrice as clean_chain_thrice } from '../clean-chain.js';
import { id as clean_effects_type_id } from '../clean-effects-type.js';
import { kept as clean_exact_kept } from '../clean-exact.js';
import { rush as clean_fields_rush, tag as clean_fields_tag, constant as clean_fields_constant } from '../clean-fields.js';
import { area as clean_fold_area } from '../clean-fold.js';
import { price as clean_namespace_price } from '../clean-namespace.js';
import { named as clean_step_kind_named, made as clean_step_kind_made } from '../clean-step-kind.js';
import { whole as clean_steps_whole } from '../clean-steps.js';
import { rounded as clean_variant_rounded, name as clean_variant_name } from '../clean-variant.js';
import { total as cycle_reference_total } from '../cycle-reference.js';
import { step as cycle_shorthand_step } from '../cycle-shorthand.js';
import { start as cycle_start } from '../cycle.js';
import { prefixed as decision_string_prefixed } from '../decision-string.js';
import { anyRush as decision_anyRush } from '../decision.js';
import { n as directive_n } from '../directive.js';
import { ready as effects_import_ready } from '../effects-import.js';
import { first as fact_method_first } from '../fact-method.js';
import { same as generic_same } from '../generic.js';
import { parsed as global_call_parsed } from '../global-call.js';
import { now as global_rebound_now } from '../global-rebound.js';
import { claimed as grammar_as_claimed } from '../grammar-as.js';
import { later as grammar_async_later } from '../grammar-async.js';
import { Counter as grammar_class_Counter } from '../grammar-class.js';
import { same as grammar_comparison_same } from '../grammar-comparison.js';
import grammar_default_default from '../grammar-default.js';
import { head as grammar_element_head } from '../grammar-element.js';
import { sign as grammar_if_sign } from '../grammar-if.js';
import { counted as grammar_let_counted } from '../grammar-let.js';
import { both as grammar_logical_both } from '../grammar-logical.js';
import { total as grammar_loop_total } from '../grammar-loop.js';
import { bumped as grammar_mutation_bumped } from '../grammar-mutation.js';
import { stamped as grammar_new_stamped } from '../grammar-new.js';
import { silent as grammar_no_return_silent } from '../grammar-no-return.js';
import { sure as grammar_nonnull_sure } from '../grammar-nonnull.js';
import { flip as grammar_not_flip } from '../grammar-not.js';
import { n as grammar_optional_n } from '../grammar-optional.js';
import { laundered as grammar_proto_laundered } from '../grammar-proto.js';
import { copied as grammar_spread_copied } from '../grammar-spread.js';
import { name as grammar_switch_name } from '../grammar-switch.js';
import { sign as grammar_ternary_sign } from '../grammar-ternary.js';
import { halt as grammar_throw_halt } from '../grammar-throw.js';
import { guarded as grammar_try_guarded } from '../grammar-try.js';
import { kindOf as grammar_typeof_kindOf } from '../grammar-typeof.js';
import { halt as never_halt } from '../never.js';
import { read as parameter_accessor_read } from '../parameter-accessor.js';
import { run as parameter_call_run } from '../parameter-call.js';
import { scaled as parameter_default_scaled } from '../parameter-default.js';
import { named as parameter_function_field_named } from '../parameter-function-field.js';
import { mapped as parameter_function_passed_mapped } from '../parameter-function-passed.js';
import { keys as parameter_method_keys } from '../parameter-method.js';
import { read as parameter_nested_any_read } from '../parameter-nested-any.js';
import { second as parameter_optional_second } from '../parameter-optional.js';
import { go as promise_go } from '../promise.js';
import { roll as random_roll } from '../random.js';
import { run as record_function_bound_run } from '../record-function-bound.js';
import { run as record_function_run } from '../record-function.js';
import { id as sealed_open_id } from '../sealed-open.js';
import { again as self_again } from '../self.js';
import { kept as shell_call_kept } from '../shell-call.js';
import { kept as shell_method_kept } from '../shell-method.js';
import { keep as unknown_parameter_keep } from '../unknown-parameter.js';
import { noted as void_noted } from '../void.js';
import { taken as widening_argument_taken } from '../widening-argument.js';
import { shape as widening_case_shape } from '../widening-case.js';
import { held as widening_element_held } from '../widening-element.js';
import { named as widening_handler_named } from '../widening-handler.js';
import { outer as widening_nested_outer } from '../widening-nested.js';
import { narrow as widening_return_narrow } from '../widening-return.js';
import { checked as widening_satisfies_checked } from '../widening-satisfies.js';
import { fact as widening_fact } from '../widening.js';

export const reached: ReadonlyArray<unknown> = [
  any_parameter_keep,
  clean_arithmetic_total,
  clean_arithmetic_label,
  clean_arithmetic_negated,
  clean_chain_thrice,
  clean_effects_type_id,
  clean_exact_kept,
  clean_fields_rush,
  clean_fields_tag,
  clean_fields_constant,
  clean_fold_area,
  clean_namespace_price,
  clean_step_kind_named,
  clean_step_kind_made,
  clean_steps_whole,
  clean_variant_rounded,
  clean_variant_name,
  cycle_reference_total,
  cycle_shorthand_step,
  cycle_start,
  decision_string_prefixed,
  decision_anyRush,
  directive_n,
  effects_import_ready,
  fact_method_first,
  generic_same,
  global_call_parsed,
  global_rebound_now,
  grammar_as_claimed,
  grammar_async_later,
  grammar_class_Counter,
  grammar_comparison_same,
  grammar_default_default,
  grammar_element_head,
  grammar_if_sign,
  grammar_let_counted,
  grammar_logical_both,
  grammar_loop_total,
  grammar_mutation_bumped,
  grammar_new_stamped,
  grammar_no_return_silent,
  grammar_nonnull_sure,
  grammar_not_flip,
  grammar_optional_n,
  grammar_proto_laundered,
  grammar_spread_copied,
  grammar_switch_name,
  grammar_ternary_sign,
  grammar_throw_halt,
  grammar_try_guarded,
  grammar_typeof_kindOf,
  never_halt,
  parameter_accessor_read,
  parameter_call_run,
  parameter_default_scaled,
  parameter_function_field_named,
  parameter_function_passed_mapped,
  parameter_method_keys,
  parameter_nested_any_read,
  parameter_optional_second,
  promise_go,
  random_roll,
  record_function_bound_run,
  record_function_run,
  sealed_open_id,
  self_again,
  shell_call_kept,
  shell_method_kept,
  unknown_parameter_keep,
  void_noted,
  widening_argument_taken,
  widening_case_shape,
  widening_element_held,
  widening_handler_named,
  widening_nested_outer,
  widening_return_narrow,
  widening_satisfies_checked,
  widening_fact,
];

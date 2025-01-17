import Fields from "./Fields";
import IQueryBuilderOptions from "./IQueryBuilderOptions";
import NestedField, { isNestedField } from "./NestedField";
import VariableOptions from "./VariableOptions";

export default class Utils {
  public static resolveVariables(operations: IQueryBuilderOptions[]): any {
    let ret: any = {};

    for (const { variables, fields } of operations) {
      ret = {
        ...ret,
        ...variables,
        ...((fields && Utils.getNestedVariables(fields)) || {}),
      };
    }
    return ret;
  }

  private static buildVariable(key: string, value: VariableOptions) {
    if (typeof value === "object") {
      const { builder } = value;
      if (builder && typeof builder === "function") {
        return builder(key, value);
      }
    }

    return `${value && value.name ? value.name : key}: $${key}`;
  }

  // Convert object to name and argument map. eg: (id: $id)
  public static queryDataNameAndArgumentMap(variables: VariableOptions) {
    return variables && Object.keys(variables).length
      ? `(${Object.entries(variables).reduce((dataString, [key, value], i) => {
          return `${dataString}${i !== 0 ? ", " : ""}${this.buildVariable(
            key,
            value
          )}`;
        }, "")})`
      : "";
  }

  public static queryFieldsMap(fields?: Fields): string {
    return fields
      ? fields
          .map((field) => {
            if (isNestedField(field)) {
              return Utils.queryNestedFieldMap(field);
            } else if (typeof field === "object") {
              let result = "";

              Object.entries<Fields>(field as Record<string, Fields>).forEach(
                ([key, values], index, array) => {
                  result += `${key} ${
                    values.length > 0
                      ? "{ " + this.queryFieldsMap(values) + " }"
                      : ""
                  }`;

                  // If it's not the last item in array, join with comma
                  if (index < array.length - 1) {
                    result += ", ";
                  }
                }
              );

              return result;
            } else {
              return `${field}`;
            }
          })
          .join(", ")
      : "";
  }

  public static operationOrAlias(
    operation: IQueryBuilderOptions["operation"]
  ): string {
    return typeof operation === "string"
      ? operation
      : `${operation.alias}: ${operation.name}`;
  }

  public static isFragment(field: NestedField): boolean {
    return field?.fragment === true ?? false;
  }

  public static operationOrFragment(field: NestedField): string {
    return Utils.isFragment(field)
      ? field.operation
      : Utils.operationOrAlias(field.operation);
  }

  public static getFragment(field: NestedField): string {
    return Utils.isFragment(field) ? "... on " : "";
  }

  public static queryNestedFieldMap(field: NestedField) {
    return `${Utils.getFragment(field)}${Utils.operationOrFragment(field)} ${
      this.isFragment(field)
        ? ""
        : this.queryDataNameAndArgumentMap(field.variables)
    } ${
      field.fields.length > 0
        ? "{ " + this.queryFieldsMap(field.fields) + " }"
        : ""
    }`;
  }

  // Variables map. eg: { "id": 1, "name": "Jon Doe" }
  public static queryVariablesMap(variables: any, fields?: Fields) {
    const variablesMapped: { [key: string]: unknown } = {};
    const update = (vars: any) => {
      if (vars) {
        Object.keys(vars).map((key) => {
          variablesMapped[key] =
            typeof vars[key] === "object" ? vars[key].value : vars[key];
        });
      }
    };

    update(variables);
    if (fields && typeof fields === "object") {
      update(Utils.getNestedVariables(fields));
    }
    return variablesMapped;
  }

  public static getNestedVariables(fields: Fields) {
    let variables = {};

    function getDeepestVariables(innerFields: Fields) {
      innerFields?.forEach((field: string | object | NestedField) => {
        if (isNestedField(field)) {
          variables = {
            ...field.variables,
            ...variables,
            ...(field.fields && getDeepestVariables(field.fields)),
          };
        } else {
          if (typeof field === "object") {
            for (const [, value] of Object.entries(field)) {
              getDeepestVariables(value);
            }
          }
        }
      });

      return variables;
    }

    getDeepestVariables(fields);

    return variables;
  }

  public static queryDataType(variable: any) {
    let type = "String";

    const value = typeof variable === "object" ? variable.value : variable;

    if (variable?.type != null) {
      type = variable.type;
    } else {
      // TODO: Should handle the undefined value (either in array value or single value)
      const candidateValue = Array.isArray(value) ? value[0] : value;
      switch (typeof candidateValue) {
        case "object":
          type = "Object";
          break;

        case "boolean":
          type = "Boolean";
          break;

        case "number":
          type = candidateValue % 1 === 0 ? "Int" : "Float";
          break;
      }
    }

    // set object based variable properties
    if (typeof variable === "object") {
      if (variable.list === true) {
        type = `[${type}]`;
      } else if (Array.isArray(variable.list)) {
        type = `[${type}${variable.list[0] ? "!" : ""}]`;
      }

      if (variable.required) {
        type += "!";
      }
    }

    return type;
  }
}

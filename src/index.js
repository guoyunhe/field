import Validate from '@alifd/validate';
import {
    getValueFromEvent,
    getErrorStrs,
    getParams,
    hasIn,
    setIn,
    getIn,
    deleteIn,
    mapValidateRules,
    warning,
    cloneToRuleArr,
    isOverwritten,
} from './utils';

const initMeta = {
    state: '',
    valueName: 'value',
    trigger: 'onChange',
    inputValues: [],
};

class Field {
    static create(com, options = {}) {
        return new this(com, options);
    }

    static getUseField({ useState, useMemo }) {
        return (options = {}) => {
            const [, setState] = useState();

            const field = useMemo(() => this.create({ setState }, options), [setState]);

            return field;
        };
    }

    constructor(com, options = {}) {
        if (!com) {
            warning('`this` is missing in `Field`, you should use like `new Field(this)`');
        }

        this.com = com;
        this.fieldsMeta = {};
        this.cachedBind = {};
        this.instance = {};
        this.instanceCount = {};
        this.reRenders = {};
        // holds constructor values. Used for setting field defaults on init if no other value or initValue is passed.
        // Also used caching values when using `parseName: true` before a field is initialized
        this.values = Object.assign({}, options.values);

        this.processErrorMessage = options.processErrorMessage;
        this.afterValidateRerender = options.afterValidateRerender;

        this.options = Object.assign(
            {
                parseName: false,
                forceUpdate: false,
                scrollToFirstError: true,
                first: false,
                onChange: () => {},
                autoUnmount: true,
                autoValidate: true,
            },
            options
        );

        [
            'init',
            'getValue',
            'getValues',
            'setValue',
            'setValues',
            'getError',
            'getErrors',
            'setError',
            'setErrors',
            'validateCallback',
            'validatePromise',
            'getState',
            'reset',
            'resetToDefault',
            'remove',
            'spliceArray',
            'addArrayValue',
            'deleteArrayValue',
            'getNames',
        ].forEach(m => {
            this[m] = this[m].bind(this);
        });
    }

    setOptions(options) {
        Object.assign(this.options, options);
    }

    /**
     * Controlled Component
     * @param {String} name
     * @param {Object} fieldOption
     * @returns {Object} {value, onChange}
     */
    init(name, fieldOption = {}, rprops) {
        const {
            id,
            initValue,
            valueName = 'value',
            trigger = 'onChange',
            rules = [],
            props = {},
            getValueFromEvent = null,
            getValueFormatter = getValueFromEvent,
            setValueFormatter,
            autoValidate = true,
            reRender,
        } = fieldOption;
        const { parseName } = this.options;

        if (getValueFromEvent) {
            warning('`getValueFromEvent` has been deprecated in `Field`, use `getValueFormatter` instead of it');
        }

        const originalProps = Object.assign({}, props, rprops);
        const defaultValueName = `default${valueName[0].toUpperCase()}${valueName.slice(1)}`;
        let defaultValue;
        if (typeof initValue !== 'undefined') {
            defaultValue = initValue;
        } else if (typeof originalProps[defaultValueName] !== 'undefined') {
            // here use typeof, in case of defaultValue={0}
            defaultValue = originalProps[defaultValueName];
        }

        // get field from this.fieldsMeta or new one
        const field = this._getInitMeta(name);
        Object.assign(field, {
            valueName,
            initValue: defaultValue,
            disabled: 'disabled' in originalProps ? originalProps.disabled : false,
            getValueFormatter,
            setValueFormatter,
            rules: cloneToRuleArr(rules),
            ref: originalProps.ref,
        });

        // Controlled Component, should always equal props.value
        if (valueName in originalProps) {
            const originalValue = originalProps[valueName];

            // When rerendering set the values from props.value
            if (parseName) {
                // when parseName is true, field should not store value locally. To prevent sync issues
                if (!('value' in field)) {
                    this._proxyFieldValue(field);
                }
            } else {
                this.values[name] = originalValue;
            }
            field.value = originalValue;
        }

        /**
         * first init field (value not in field)
         * should get field.value from this.values or defaultValue
         */
        if (!('value' in field)) {
            if (parseName) {
                const cachedValue = getIn(this.values, name);
                const initValue = typeof cachedValue !== 'undefined' ? cachedValue : defaultValue;
                // when parseName is true, field should not store value locally. To prevent sync issues
                this._proxyFieldValue(field);
                field.value = initValue;
            } else {
                const cachedValue = this.values[name];
                if (typeof cachedValue !== 'undefined') {
                    field.value = cachedValue;
                } else if (typeof defaultValue !== 'undefined') {
                    // should be same with parseName, but compatible with old versions
                    field.value = defaultValue;
                    this.values[name] = field.value;
                }
            }
        }

        // Component props
        const inputProps = {
            'data-meta': 'Field',
            id: id || name,
            ref: this._getCacheBind(name, `${name}__ref`, this._saveRef),
            [valueName]: setValueFormatter ? setValueFormatter(field.value, field.inputValues) : field.value,
        };

        let rulesMap = {};

        if (this.options.autoValidate && autoValidate !== false) {
            // trigger map in rules,
            rulesMap = mapValidateRules(field.rules, trigger);

            // step1 : validate hooks
            for (const action in rulesMap) {
                // skip default trigger, which will trigger in step2
                if (action === trigger) {
                    continue;
                }

                const actionRule = rulesMap[action];
                inputProps[action] = (...args) => {
                    this._callNativePropsEvent(action, originalProps, ...args);
                    this._validate(name, actionRule, action);
                };
            }
        }

        // step2: onChange(trigger=onChange by default) hack
        inputProps[trigger] = (...args) => {
            this._updateFieldValue(name, ...args);

            // clear validate error
            this._resetError(name);

            this._callNativePropsEvent(trigger, originalProps, ...args);
            // call global onChange
            this.options.onChange(name, field.value);

            // validate while onChange
            const rule = rulesMap[trigger];
            rule && this._validate(name, rule, trigger);

            this._reRender(name, trigger);
        };

        // step3: save reRender function
        if (reRender && typeof reRender === 'function') {
            this.reRenders[name] = reRender;
        }

        delete originalProps[defaultValueName];

        return Object.assign({}, originalProps, inputProps);
    }

    /**
     * call native event from props.onXx
     * eg: props.onChange props.onBlur props.onFocus
     */
    _callNativePropsEvent(action, props, ...args) {
        action in props && typeof props[action] === 'function' && props[action](...args);
    }

    _getInitMeta(name) {
        if (!(name in this.fieldsMeta)) {
            this.fieldsMeta[name] = Object.assign({ name }, initMeta);
        }

        return this.fieldsMeta[name];
    }

    _proxyFieldValue(field) {
        const _this = this;
        Object.defineProperty(field, 'value', {
            configurable: true,
            enumerable: true,
            get() {
                return getIn(_this.values, this.name);
            },
            set(v) {
                // 此处this解释同上
                _this.values = setIn(_this.values, this.name, v);
                return true;
            },
        });
    }

    /**
     * update field.value and validate
     */
    _updateFieldValue(name, ...others) {
        const e = others[0];
        const field = this._get(name);

        if (!field) {
            return;
        }

        field.value = field.getValueFormatter ? field.getValueFormatter.apply(this, others) : getValueFromEvent(e);
        field.inputValues = others;

        if (this.options.parseName) {
            this.values = setIn(this.values, name, field.value);
        } else {
            this.values[name] = field.value;
        }
    }

    /**
     * ref must always be the same function, or if not it will be triggerd every time.
     * @param {String} name name of component
     * @param {String} action key to find ref
     * @param {Function} fn saveRef
     */
    _getCacheBind(name, action, fn) {
        const cache = (this.cachedBind[name] = this.cachedBind[name] || {});
        if (!cache[action]) {
            cache[action] = fn.bind(this, name);
        }
        return cache[action];
    }

    _setCache(name, action, hander) {
        const cache = (this.cachedBind[name] = this.cachedBind[name] || {});
        cache[action] = hander;
    }

    _getCache(name, action) {
        const cache = this.cachedBind[name] || {};
        return cache[action];
    }

    /**
     * NOTE: saveRef is async function. it will be called after render
     * @param {String} name name of component
     * @param {Function} component ref
     */
    _saveRef(name, component) {
        const key = `${name}_field`;
        const autoUnmount = this.options.autoUnmount;

        if (!component && autoUnmount) {
            // more than one component, do nothing
            this.instanceCount[name] && this.instanceCount[name]--;
            if (this.instanceCount[name] > 0) {
                return;
            }

            // component with same name (eg: type ? <A name="n"/>:<B name="n"/>)
            // while type changed, B will render before A unmount. so we should cached value for B
            // step: render -> B mount -> 1. _saveRef(A, null) -> 2. _saveRef(B, ref) -> render
            // 1. _saveRef(A, null)
            const cache = this.fieldsMeta[name];
            if (cache) {
                if (this.options.parseName) {
                    // 若parseName模式下，因为value为getter、setter，所以将当前值记录到_value内
                    cache._value = cache.value;
                }
                this._setCache(name, key, cache);
            }

            // after destroy, delete data
            delete this.instance[name];
            delete this.reRenders[name];
            this.remove(name);
            return;
        }

        // 2. _saveRef(B, ref) (eg: same name but different compoent may be here)
        if (autoUnmount && !this.fieldsMeta[name] && this._getCache(name, key)) {
            const cache = this._getCache(name, key);
            this.fieldsMeta[name] = cache;
            // 若parseName模式，则使用_value作为值设置到values内
            this.setValue(name, this.options.parseName ? cache._value : cache.value, false);
            this.options.parseName && '_value' in cache && delete cache._value;
        }

        // only one time here
        const field = this._get(name);
        if (field) {
            const ref = field.ref;
            if (ref) {
                if (typeof ref === 'string') {
                    throw new Error(`can not set string ref for ${name}`);
                } else if (typeof ref === 'function') {
                    ref(component);
                } else if (typeof ref === 'object' && 'current' in ref) {
                    // while ref = React.createRef() ref={ current: null}
                    ref.current = component;
                }
            }

            // mount
            if (autoUnmount && component) {
                let cnt = this.instanceCount[name];
                if (!cnt) {
                    cnt = 0;
                }

                this.instanceCount[name] = cnt + 1;
            }

            this.instance[name] = component;
        }
    }

    /**
     * validate one Component
     * @param {String} name name of Component
     * @param {Array} rule
     * @param {String} trigger onChange/onBlur/onItemClick/...
     */
    _validate(name, rule, trigger) {
        const field = this._get(name);
        if (!field) {
            return;
        }

        const value = field.value;

        field.state = 'loading';
        let validate = this._getCache(name, trigger);

        if (validate && typeof validate.abort === 'function') {
            validate.abort();
        }
        validate = new Validate({ [name]: rule }, { messages: this.options.messages });

        this._setCache(name, trigger, validate);

        validate.validate(
            {
                [name]: value,
            },
            errors => {
                let newErrors, newState;
                if (errors && errors.length) {
                    newErrors = getErrorStrs(errors, this.processErrorMessage);
                    newState = 'error';
                } else {
                    newErrors = [];
                    newState = 'success';
                }

                let reRender = false;
                // only status or errors changed, Rerender
                if (
                    newState !== field.state ||
                    !field.errors ||
                    newErrors.length !== field.errors.length ||
                    newErrors.find((e, idx) => e !== field.errors[idx])
                ) {
                    reRender = true;
                }

                field.errors = newErrors;
                field.state = newState;

                reRender && this._reRender(name, 'validate');
            }
        );
    }

    getValue(name) {
        if (this.options.parseName) {
            return getIn(this.values, name);
        }
        return this.values[name];
    }

    /**
     * 1. get values by names.
     * 2. If no names passed, return shallow copy of `field.values`
     * @param {Array} names
     */
    getValues(names) {
        const allValues = {};

        if (names && names.length) {
            names.forEach(name => {
                allValues[name] = this.getValue(name);
            });
        } else {
            Object.assign(allValues, this.values);
        }

        return allValues;
    }

    setValue(name, value, reRender = true) {
        if (name in this.fieldsMeta) {
            this.fieldsMeta[name].value = value;
        }
        if (this.options.parseName) {
            this.values = setIn(this.values, name, value);
        } else {
            this.values[name] = value;
        }
        reRender && this._reRender(name, 'setValue');
    }

    setValues(fieldsValue = {}, reRender = true) {
        if (!this.options.parseName) {
            Object.keys(fieldsValue).forEach(name => {
                this.setValue(name, fieldsValue[name], false);
            });
        } else {
            // NOTE: this is a shallow merge
            // Ex. we have two values a.b.c=1 ; a.b.d=2, and use setValues({a:{b:{c:3}}}) , then because of shallow merge a.b.d will be lost, we will get only {a:{b:{c:3}}}
            // fieldsMeta[name].value is proxy from this.values[name] when parseName is true, so there is no need to assign value to fieldMeta
            // shallow merge
            let newValues = Object.assign({}, this.values, fieldsValue);
            const fields = this.getNames();
            // record all old field values, exclude items overwritten by fieldsValue
            const oldFieldValues = fields
                .filter(name => !isOverwritten(fieldsValue, name))
                .map(name => ({ name, value: this.fieldsMeta[name].value }));
            // assign lost field value to newValues
            oldFieldValues.forEach(({ name, value }) => {
                if (!hasIn(newValues, name)) {
                    newValues = setIn(newValues, name, value);
                }
            });
            // store the new values
            this.values = newValues;
        }
        reRender && this._reRender();
    }

    setError(name, errors) {
        const err = Array.isArray(errors) ? errors : errors ? [errors] : [];
        if (name in this.fieldsMeta) {
            this.fieldsMeta[name].errors = err;
        } else {
            this.fieldsMeta[name] = {
                errors: err,
            };
        }

        if (this.fieldsMeta[name].errors && this.fieldsMeta[name].errors.length > 0) {
            this.fieldsMeta[name].state = 'error';
        } else {
            this.fieldsMeta[name].state = '';
        }

        this._reRender(name, 'setError');
    }

    setErrors(fieldsErrors = {}) {
        Object.keys(fieldsErrors).forEach(name => {
            this.setError(name, fieldsErrors[name]);
        });
    }

    getError(name) {
        const field = this._get(name);
        if (field && field.errors && field.errors.length) {
            return field.errors;
        }

        return null;
    }

    getErrors(names) {
        const fields = names || this.getNames();
        const allErrors = {};
        fields.forEach(f => {
            allErrors[f] = this.getError(f);
        });
        return allErrors;
    }

    getState(name) {
        const field = this._get(name);

        if (field && field.state) {
            return field.state;
        }

        return '';
    }

    /**
     * Get errors using `getErrors` and format to match the structure of errors returned in field.validate
     * @param {Array} fieldNames
     * @return {Object || null} map of inputs and their errors
     */
    formatGetErrors(fieldNames) {
        const errors = this.getErrors(fieldNames);
        let formattedErrors = null;
        for (const field in errors) {
            if (errors.hasOwnProperty(field) && errors[field]) {
                const errorsObj = errors[field];
                if (!formattedErrors) {
                    formattedErrors = {};
                }
                formattedErrors[field] = { errors: errorsObj };
            }
        }
        return formattedErrors;
    }

    /**
     * validate by trigger
     * @param {Array} ns names
     * @param {Function} cb callback after validate
     */
    validateCallback(ns, cb) {
        const { names, callback } = getParams(ns, cb);
        const fieldNames = names || this.getNames();

        const descriptor = {};
        const values = {};

        let hasRule = false;
        for (let i = 0; i < fieldNames.length; i++) {
            const name = fieldNames[i];
            const field = this._get(name);

            if (!field) {
                continue;
            }

            if (field.rules && field.rules.length) {
                descriptor[name] = field.rules;
                values[name] = this.getValue(name);
                hasRule = true;

                // clear error
                field.errors = [];
                field.state = '';
            }
        }

        if (!hasRule) {
            const errors = this.formatGetErrors(fieldNames);
            callback && callback(errors, this.getValues(names ? fieldNames : []));
            return;
        }

        const validate = new Validate(descriptor, {
            first: this.options.first,
            messages: this.options.messages,
        });

        validate.validate(values, errors => {
            let errorsGroup = null;
            if (errors && errors.length) {
                errorsGroup = {};
                errors.forEach(e => {
                    const fieldName = e.field;
                    if (!errorsGroup[fieldName]) {
                        errorsGroup[fieldName] = {
                            errors: [],
                        };
                    }
                    const fieldErrors = errorsGroup[fieldName].errors;
                    fieldErrors.push(e.message);
                });
            }
            if (errorsGroup) {
                // update error in every Field
                Object.keys(errorsGroup).forEach(i => {
                    const field = this._get(i);
                    if (field) {
                        field.errors = getErrorStrs(errorsGroup[i].errors, this.processErrorMessage);
                        field.state = 'error';
                    }
                });
            }

            const formattedGetErrors = this.formatGetErrors(fieldNames);

            if (formattedGetErrors) {
                errorsGroup = Object.assign({}, formattedGetErrors, errorsGroup);
            }

            // update to success which has no error
            for (let i = 0; i < fieldNames.length; i++) {
                const name = fieldNames[i];
                const field = this._get(name);
                if (field && field.rules && !(errorsGroup && name in errorsGroup)) {
                    field.state = 'success';
                }
            }

            // eslint-disable-next-line callback-return
            callback && callback(errorsGroup, this.getValues(names ? fieldNames : []));
            this._reRender(names, 'validate');

            if (typeof this.afterValidateRerender === 'function') {
                this.afterValidateRerender({
                    errorsGroup,
                    options: this.options,
                    instance: this.instance,
                });
            }
        });
    }

    /**
     * validate by trigger - Promise version
     * NOTES:
     * - `afterValidateRerender` is not called in `validatePromise`. The rerender is called just before this function
     *      returns a promise, so use the returned promise to call any after rerender logic.
     *
     * @param {Array} ns names
     * @param {Function} cb (Optional) callback after validate, must return a promise or a value
     *                  - ({errors, values}) => Promise({errors, values}) | {errors, values}
     * @returns {Promise} - resolves with {errors, values}
     */
    async validatePromise(ns, cb) {
        const { names, callback } = getParams(ns, cb);
        const fieldNames = names || this.getNames();

        const descriptor = {};
        const values = {};

        let hasRule = false;
        for (let i = 0; i < fieldNames.length; i++) {
            const name = fieldNames[i];
            const field = this._get(name);

            if (!field) {
                continue;
            }

            if (field.rules && field.rules.length) {
                descriptor[name] = field.rules;
                values[name] = this.getValue(name);
                hasRule = true;

                // clear error
                field.errors = [];
                field.state = '';
            }
        }

        if (!hasRule) {
            const errors = this.formatGetErrors(fieldNames);
            if (callback) {
                return callback({
                    errors,
                    values: this.getValues(names ? fieldNames : []),
                });
            } else {
                return {
                    errors,
                    values: this.getValues(names ? fieldNames : []),
                };
            }
        }

        const validate = new Validate(descriptor, {
            first: this.options.first,
            messages: this.options.messages,
        });

        const results = await validate.validatePromise(values);
        const errors = (results && results.errors) || [];

        const errorsGroup = this._getErrorsGroup({ errors, fieldNames });

        let callbackResults = {
            errors: errorsGroup,
            values: this.getValues(names ? fieldNames : []),
        };
        try {
            if (callback) {
                callbackResults = await callback(callbackResults);
            }
        } catch (error) {
            return error;
        }
        this._reRender(names, 'validate');

        return callbackResults;
    }

    _getErrorsGroup({ errors, fieldNames }) {
        let errorsGroup = null;
        if (errors && errors.length) {
            errorsGroup = {};
            errors.forEach(e => {
                const fieldName = e.field;
                if (!errorsGroup[fieldName]) {
                    errorsGroup[fieldName] = {
                        errors: [],
                    };
                }
                const fieldErrors = errorsGroup[fieldName].errors;
                fieldErrors.push(e.message);
            });
        }
        if (errorsGroup) {
            // update error in every Field
            Object.keys(errorsGroup).forEach(i => {
                const field = this._get(i);
                if (field) {
                    field.errors = getErrorStrs(errorsGroup[i].errors, this.processErrorMessage);
                    field.state = 'error';
                }
            });
        }

        const formattedGetErrors = this.formatGetErrors(fieldNames);

        if (formattedGetErrors) {
            errorsGroup = Object.assign({}, formattedGetErrors, errorsGroup);
        }

        // update to success which has no error
        for (let i = 0; i < fieldNames.length; i++) {
            const name = fieldNames[i];
            const field = this._get(name);
            if (field && field.rules && !(errorsGroup && name in errorsGroup)) {
                field.state = 'success';
            }
        }

        return errorsGroup;
    }

    _reset(ns, backToDefault) {
        if (typeof ns === 'string') {
            ns = [ns];
        }
        let changed = false;

        const names = ns || Object.keys(this.fieldsMeta);

        if (!ns) {
            this.values = {};
        }
        names.forEach(name => {
            const field = this._get(name);
            if (field) {
                changed = true;

                field.value = backToDefault ? field.initValue : undefined;
                field.state = '';

                delete field.errors;
                delete field.rules;
                delete field.rulesMap;

                if (this.options.parseName) {
                    this.values = setIn(this.values, name, field.value);
                } else {
                    this.values[name] = field.value;
                }
            }
        });

        if (changed) {
            this._reRender(names, 'reset');
        }
    }

    reset(ns) {
        this._reset(ns, false);
    }

    resetToDefault(ns) {
        this._reset(ns, true);
    }

    getNames() {
        const fieldsMeta = this.fieldsMeta;
        return Object.keys(fieldsMeta).filter(() => {
            return true;
        });
    }

    remove(ns) {
        if (typeof ns === 'string') {
            ns = [ns];
        }
        if (!ns) {
            this.values = {};
        }

        const names = ns || Object.keys(this.fieldsMeta);
        names.forEach(name => {
            if (name in this.fieldsMeta) {
                delete this.fieldsMeta[name];
            }
            if (this.options.parseName) {
                this.values = deleteIn(this.values, name);
            } else {
                delete this.values[name];
            }
        });
    }

    addArrayValue(key, index, ...argv) {
        return this._spliceArrayValue(key, index, 0, ...argv);
    }

    deleteArrayValue(key, index, howmany = 1) {
        return this._spliceArrayValue(key, index, howmany);
    }

    /**
     * splice array
     * @param {String} key
     * @param {Number} startIndex
     * @param {Number} howmany
     * @param {Array} argv
     * @param {*} value
     */
    _spliceArrayValue(key, index, howmany, ...argv) {
        const argc = argv.length;
        const offset = howmany - argc; // how the reset fieldMeta move
        const startIndex = index + howmany; // 计算起点

        /**
         * eg: call _spliceArrayValue('key', 1) to delete 'key.1':
         *   case 1: names=['key.0', 'key.1']; delete 'key.1';
         *   case 2: names=['key.0', 'key.1', 'key.2']; key.1= key.2; delete key.2;
         *   case 3: names=['key.0.name', 'key.0.email', 'key.1.name', 'key.1.email'], should delete 'key.1.name', 'key.1.email'
         * eg: call _spliceArrayValue('key', 1, item) to add 'key.1':
         *   case 1: names=['key.0']; add 'key.1' = item;
         *   case 2: names=['key.0', 'key.1']; key.2= key.1; delete key.1; add key.1 = item;
         */
        const listMap = {}; // eg: {1:[{from: 'key.2.name', to: 'key.1.name'}, {from: 'key.2.email', to: 'key.1.email'}]}
        const replacedReg = /\$/g;
        // 替换特殊字符$
        const replacedKey = key.replace(replacedReg, '\\$&');
        const keyReg = new RegExp(`^(${replacedKey}.)(\\d+)`);
        const replaceArgv = [];
        const names = this.getNames();

        // logic of offset fix begin
        names.forEach(n => {
            const ret = keyReg.exec(n);
            if (ret) {
                const idx = parseInt(ret[2]); // get index of 'key.0.name'

                if (idx >= startIndex) {
                    let l = listMap[idx];
                    const item = {
                        from: n,
                        to: n.replace(keyReg, (match, p1) => `${p1}${idx - offset}`),
                    };
                    if (!l) {
                        listMap[idx] = [item];
                    } else {
                        l.push(item);
                    }
                }

                // in case of offsetList.length = 0, eg: delete last element
                if (offset > 0 && idx >= index && idx < index + howmany) {
                    replaceArgv.push(n);
                }
            }
        });

        // sort with index eg: [{index:1, list: [{from: 'key.2.name', to: 'key.1.name'}]}, {index:2, list: [...]}]
        const offsetList = Object.keys(listMap)
            .map(i => {
                return {
                    index: Number(i),
                    list: listMap[i],
                };
            })
            .sort((a, b) => (offset > 0 ? a.index - b.index : b.index - a.index));

        offsetList.forEach(l => {
            const list = l.list;
            list.forEach(i => {
                this.fieldsMeta[i.to] = this.fieldsMeta[i.from];
                // 移位后，同步调整name
                this.fieldsMeta[i.to].name = i.to;
            });
        });

        // delete copy data
        if (offsetList.length > 0) {
            const removeList = offsetList.slice(offsetList.length - (offset < 0 ? -offset : offset), offsetList.length);
            removeList.forEach(item => {
                item.list.forEach(i => {
                    delete this.fieldsMeta[i.from];
                });
            });
        } else {
            // will get from this.values while rerender
            replaceArgv.forEach(i => {
                delete this.fieldsMeta[i];
            });
        }

        const p = this.getValue(key);
        if (p) {
            p.splice(index, howmany, ...argv);
        }

        this._reRender();
    }

    /**
     * splice in a Array [deprecated]
     * @param {String} keyMatch like name.{index}
     * @param {Number} startIndex index
     */
    spliceArray(keyMatch, startIndex, howmany) {
        if (keyMatch.match(/{index}$/) === -1) {
            warning('key should match /{index}$/');
            return;
        }

        // regex to match field names in the same target array
        const reg = keyMatch.replace('{index}', '(\\d+)');
        const keyReg = new RegExp(`^${reg}`);

        const listMap = {};
        /**
         * keyMatch='key.{index}'
         * case 1: names=['key.0', 'key.1'], should delete 'key.1'
         * case 2: names=['key.0.name', 'key.0.email', 'key.1.name', 'key.1.email'], should delete 'key.1.name', 'key.1.email'
         */
        const names = this.getNames();
        names.forEach(n => {
            // is name in the target array?
            const ret = keyReg.exec(n);
            if (ret) {
                const index = parseInt(ret[1]);

                if (index > startIndex) {
                    let l = listMap[index];
                    const item = {
                        from: n,
                        to: `${keyMatch.replace('{index}', index - 1)}${n.replace(ret[0], '')}`,
                    };
                    if (!l) {
                        listMap[index] = [item];
                    } else {
                        l.push(item);
                    }
                }
            }
        });

        const idxList = Object.keys(listMap)
            .map(i => {
                return {
                    index: Number(i),
                    list: listMap[i],
                };
            })
            .sort((a, b) => a.index < b.index);

        // should be continuous array
        if (idxList.length > 0 && idxList[0].index === startIndex + 1) {
            idxList.forEach(l => {
                const list = l.list;
                list.forEach(i => {
                    const v = this.getValue(i.from); // get index value
                    this.setValue(i.to, v, false); // set value to index - 1
                });
            });

            const lastIdxList = idxList[idxList.length - 1];
            lastIdxList.list.forEach(i => {
                this.remove(i.from);
            });

            let parentName = keyMatch.replace('.{index}', '');
            parentName = parentName.replace('[{index}]', '');
            const parent = this.getValue(parentName);

            if (parent) {
                // if parseName=true then parent is an Array object but does not know an element was removed
                // this manually decrements the array length
                parent.length--;
            }
        }
    }

    _resetError(name) {
        const field = this._get(name);
        if (field) {
            delete field.errors; //清空错误
            field.state = '';
        }
    }

    //trigger rerender
    _reRender(name, action) {
        // 指定了字段列表且字段存在对应的自定义渲染函数
        if (name) {
            const names = Array.isArray(name) ? name : [name];
            if (names.length && names.every(n => this.reRenders[n])) {
                names.forEach(n => {
                    const reRender = this.reRenders[n];
                    reRender(action);
                });
                return;
            }
        }

        if (this.com) {
            if (!this.options.forceUpdate && this.com.setState) {
                this.com.setState({});
            } else if (this.com.forceUpdate) {
                this.com.forceUpdate(); //forceUpdate 对性能有较大的影响，成指数上升
            }
        }
    }

    _get(name) {
        return name in this.fieldsMeta ? this.fieldsMeta[name] : null;
    }

    get(name) {
        if (name) {
            return this._get(name);
        } else {
            return this.fieldsMeta;
        }
    }
}

export default Field;

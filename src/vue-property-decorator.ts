/** vue-property-decorator verson 7.3.0 MIT LICENSE copyright 2018 kaorun343 */

// 该框架依赖vue-class-component，createDecorator提供了创建属性装饰器的功能。
// 所有装饰器的核心就是用createDecorator获取控件的options，然后将装饰器传入的属性注册options中

'use strict'
import Vue, { PropOptions, WatchOptions } from 'vue'
import Component, { createDecorator, mixins } from 'vue-class-component'
import { InjectKey, WatchHandler } from 'vue/types/options'

export type Constructor = {
  new(...args: any[]): any
}

// 将vue、Component的部分内容导出，其实感觉没有必要
export { Component, Vue, mixins as Mixins }

/**
 * decorator of an inject
 * @param from key
 * @return PropertyDecorator
 */
// 注册inject的属性装饰器
export function Inject(options?: { from?: InjectKey, default?: any } | InjectKey): PropertyDecorator {
  return createDecorator((componentOptions, key) => {
    // 确保inject肯定存在
    if (typeof componentOptions.inject === 'undefined') {
      componentOptions.inject = {}
    }
    
    // 这还能是数组？？？如果是数组怎么办？
    // 根据vue的extend源码中，resolveModifiedOptions函数有可能会将options中的inject合并成数组，如果是数组，就不处理了？？？
    if (!Array.isArray(componentOptions.inject)) {
      componentOptions.inject[key] = options || key
    }
  })
}

/**
 * decorator of a provide
 * @param key key
 * @return PropertyDecorator | void
 */
// 注册provide的属性装饰器
export function Provide(key?: string | symbol): PropertyDecorator {
  return createDecorator((componentOptions, k) => {
    let provide: any = componentOptions.provide
    
    // 如果当前的provide不是函数，会用一个函数生成新的provide
    // provide的源码还没读，所有不清楚managed是什么意思，这不是公有API，现在不确定managed是否是Vue的私有属性
    if (typeof provide !== 'function' || !provide.managed) {
      const original = componentOptions.provide
      provide = componentOptions.provide = function (this: any) {
        let rv = Object.create((typeof original === 'function' ? original.call(this) : original) || null)
        for (let i in provide.managed) rv[provide.managed[i]] = this[i]
        return rv
      }
      provide.managed = {}
    }
    
    provide.managed[k] = key || k
  })
}

/**
 * decorator of model
 * @param  event event name
 * @param options options
 * @return PropertyDecorator
 */
// 注册model的属性装饰器
// Model是加强的Prop，比Prop多了一个事件名
export function Model(event?: string, options: (PropOptions | Constructor[] | Constructor) = {}): PropertyDecorator {
  return createDecorator((componentOptions, k) => {
    // 与Prop一样注册props
    (componentOptions.props || (componentOptions.props = {}) as any)[k] = options
    
    // 注册
    componentOptions.model = { prop: k, event: event || k }
  })
}

/**
 * decorator of a prop
 * @param  options the options for the prop
 * @return PropertyDecorator | void
 */
// 注册props的属性装饰器
export function Prop(options: (PropOptions | Constructor[] | Constructor) = {}): PropertyDecorator {
  return createDecorator((componentOptions, k) => {
    // 观察componentOptions是否包含props，如果包含就创建props对象，然后将属性赋给他。
    // (componentOptions.props || (componentOptions.props = {}) as any)在Vue源码中也有，虽然这种写法难懂，但是省代码行数，值得学习
    (componentOptions.props || (componentOptions.props = {}) as any)[k] = options
  })
}

/**
 * decorator of a watch function
 * @param  path the path or the expression to observe
 * @param  WatchOption
 * @return MethodDecorator
 */
// 注册watch的属性装饰器
export function Watch(path: string, options: WatchOptions = {}): MethodDecorator {
  const { deep = false, immediate = false } = options

  return createDecorator((componentOptions, handler) => {
    if (typeof componentOptions.watch !== 'object') {
      componentOptions.watch = Object.create(null)
    }

    const watch: any = componentOptions.watch
    
    // 因为同一path可能会注册多个，所有先把这个path设置为数组
    if (typeof watch[path] === 'object' && !Array.isArray(watch[path])) {
      watch[path] = [watch[path]]
    } else if (typeof watch[path] === 'undefined') {
      watch[path] = []
    }

    watch[path].push({ handler, deep, immediate })
  })
}

// Code copied from Vue/src/shared/util.js
const hyphenateRE = /\B([A-Z])/g
const hyphenate = (str: string) => str.replace(hyphenateRE, '-$1').toLowerCase()

/**
 * decorator of an event-emitter function
 * @param  event The name of the event
 * @return MethodDecorator
 */
// 函数执行后自动触发事件。原理是通过装饰器获取descriptor，类似于aop那样插入执行逻辑
// 需要注意的是，如果返回值是promise,要在promise执行后再触发事件
export function Emit(event?: string): MethodDecorator {
  return function (_target: Vue, key: string, descriptor: any) {
    // 如果event为空，就用函数名做事件名
    key = hyphenate(key)
    const original = descriptor.value
    descriptor.value = function emitter(...args: any[]) {
      const emit = (returnValue: any) => {
        // 没有看懂，为什么要将args也emit出去？？？？不是应该只要emit了returnValue就可以了？？？
        if (returnValue !== undefined) args.unshift(returnValue)
        this.$emit(event || key, ...args)
      }

      // 真正这是事件
      const returnValue: any = original.apply(this, args)

      // 需要注意的是，如果返回值是promise,要在promise执行后再触发事件
      // 出现异常不执行事件
      if (isPromise(returnValue)) {
        returnValue.then(returnValue => {
          emit(returnValue)
        })
      } else {
        emit(returnValue)
      }
    }
  }
}

// 判断对象是否是promise对象，因为promise有很多补丁，所用光用instanceof Promise无法检测出第三方实现的promise，使用then是否等于函数以便兼容特殊写法
function isPromise(obj: any): obj is Promise<any> {
  return obj instanceof Promise || (obj && typeof obj.then === 'function')
}

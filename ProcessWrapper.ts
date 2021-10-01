import { spawn, ChildProcess } from 'child_process'
import { Processifiable, StringifiedProcessResult } from './types'
import { Readable, Writable } from 'stream'
import { Fun, logGrey, logYellow } from './utils'

export type OptionalArgs = {
  custom_stdin?: Readable,
  custom_stdout?: Writable,
  custom_stderr?: Writable,
  whenCodeNotZero?: Fun<StringifiedProcessResult, void>
  verbal?:boolean
  interactive?:boolean
}

export default class ProcessWrapper {
  private innerProcess: ChildProcess
  private custom_stdin?: Readable
  private custom_stdout?: Writable
  private custom_stderr?: Writable
  private whenCodeNotZero?: Fun<StringifiedProcessResult, void>

  private accumStdout: any
  private accumStderr: any

  constructor(process_like: Processifiable,optionalArgs?:OptionalArgs) {
    this.accumStdout = ''
    this.accumStderr = ''

    try {
      let command = process_like as [string, string[]]
      if (typeof command[0] != 'string' || typeof command[1] != 'object')
        throw 'no parse'
      this.innerProcess = optionalArgs?.interactive ? spawn(command[0], command[1],{stdio:'inherit'}) : spawn(command[0], command[1])
    } catch {
      try {
        let command = process_like as string
        const parsed = require('yargs/yargs')().parserConfiguration({
          "short-option-groups": false,
          "unknown-options-as-args": true,
          "dot-notation": false,
          "duplicate-arguments-array": false,
        }).parse(command)
        let args = parsed._.map((arg:string) => arg == `'--'` ? '--' : arg)
        const cmd = args.shift() as string
        this.innerProcess = optionalArgs?.interactive ? spawn(cmd, args,{stdio:'inherit'}) : spawn(cmd, args)
      } catch {
        try {
          let command = process_like as ProcessWrapper
          if (command.innerProcess == null)
            throw "Not a ProcessWrapper"
          this.innerProcess = command.innerProcess
        } catch {
          try {
            let command = process_like as ChildProcess
            if (command.pid == null)
              throw "Not a ChildProcess"
            this.innerProcess = command
          } catch {
            throw "Cannot construct ProcessWrapper"
          }
        }
      }
    }

    this.innerProcess.stdout?.on('data', data => this.accumStdout += data)
    this.innerProcess.stderr?.on('data', data => this.accumStderr += data)
    if(optionalArgs?.verbal) {
      this.innerProcess.stdout?.on('data', data => logGrey(data.toString()))
      this.innerProcess.stderr?.on('data', data => logYellow(data.toString()))
    }

    if (optionalArgs?.custom_stdin)
      this.redirectStdin(optionalArgs?.custom_stdin)

    if (optionalArgs?.custom_stdout)
      this.redirectStdout(optionalArgs?.custom_stdout)

    if (optionalArgs?.custom_stderr)
      this.redirectStderr(optionalArgs?.custom_stderr)

    if (optionalArgs?.whenCodeNotZero)
      this.setWhenCodeNotZero(optionalArgs?.whenCodeNotZero)
  }

  setWhenCodeNotZero(whenCodeNotZero: Fun<StringifiedProcessResult, void>): ProcessWrapper {
    this.whenCodeNotZero = whenCodeNotZero
    this.innerProcess.on('close', code => code != 0 && this.whenCodeNotZero && this.whenCodeNotZero({ code: code, stdout: this.accumStdout.toString(), stderr: this.accumStderr.toString() }))
    return this
  }

  redirectStdin(source: Readable): void {
    this.custom_stdin = source
    this.custom_stdin.on('data', chunk => this.innerProcess.stdin?.write(chunk))
    this.custom_stdin.on('close', () => this.innerProcess.stdin?.end())
  }

  redirectStdout(target: Writable): void {
    this.custom_stdout = target
    this.innerProcess.stdout?.on('data', chunk => this.custom_stdout?.write(chunk))
    this.innerProcess.on('close', _ => this.custom_stdout?.end())
  }

  redirectStderr(target: Writable): void {
    this.custom_stderr = target
    this.innerProcess.stderr?.on('data', chunk => this.custom_stderr?.write(chunk))
    this.innerProcess.on('close', _ => this.custom_stderr?.end())
  }

  pipe(command: Processifiable, optionalArgs?:OptionalArgs): ProcessWrapper {
    let next_process = new ProcessWrapper(command, optionalArgs)

    if (optionalArgs == null || optionalArgs.custom_stdin == null) {
      this.innerProcess.stdout?.on('data', data => next_process.innerProcess.stdin?.write(data))
      this.innerProcess.on('close', _ => next_process.innerProcess.stdin?.end())
    }

    return next_process
  }

  async run(): Promise<StringifiedProcessResult> {
    return new Promise<StringifiedProcessResult>((res, _) => this.innerProcess.on('close', code => res({ stdout: this.accumStdout.toString(), stderr: this.accumStderr.toString(), code: code })))
  }

  asProcess(): ChildProcess {
    return this.innerProcess
  }

}
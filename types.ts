import { ProcessWrapper } from "./ProcessWrapper"
import { ChildProcessWithoutNullStreams } from "child_process"

export type ProcessResult = {
  stdout: any,
  stderr: any,
  code: number
}

export type StringifiedProcessResult = {
  stdout: string,
  stderr: string,
  code: number
}

export type Processifiable = string 
                           | [string,string[]] 
                           | ChildProcessWithoutNullStreams
                           | ProcessWrapper

export type StringList = string[]

export type ConnectionObj = {
  username:string,
  password:string,
  host:string,
  port:number,
  database?:string
}
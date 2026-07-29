import { IControlOption } from '../../interface/Control'

export const defaultControlOption: Readonly<Required<IControlOption>> = {
  placeholderColor: '#9c9b9b',
  defaultValueColor: '#4a9aff',
  selectValueColor: '#4a9aff',
  highNumberColor: '#f56b34',
  lowNumberColor: '#0000FF',
  bracketColor: '#000000',
  prefix: '{',
  postfix: '}',
  borderWidth: 1,
  borderColor: '#000000',
  activeBackgroundColor: '',
  disabledBackgroundColor: '',
  existValueBackgroundColor: '',
  noValueBackgroundColor: ''
}

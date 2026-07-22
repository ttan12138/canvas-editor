import { IControlOption } from '../../interface/Control'

export const defaultControlOption: Readonly<Required<IControlOption>> = {
  placeholderColor: '#2dbe7f',
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

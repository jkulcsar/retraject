	#ifndef _THIRD_H
	#define _THIRD_H
	#endif

	#ifndef _DATATYPE_H
	#include "datatype.h"
	#endif

	#ifndef _TRAJECT_H
	#include "traject.h"
	#endif


	class	Third : public Trajectory
	{
		protected:
			BOOL	m_ComputePosition( void );
			BOOL	m_ComputeSpeed( void );
			BOOL	m_ComputeAcceleration( void );
			float	m_ComputeTrajectoryTime( void );
			BOOL	m_ComputeLambda( void );

			float	RPos( float );
			float	RAcc( float );
			float	RSpd( float );


		public:

			Third(  void ); 				// Default constructor ...
			Third(  Third& );				// Copy    constructor ...
			~Third( void );					// Destructor  ...

	};
